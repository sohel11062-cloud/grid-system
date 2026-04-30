import "server-only";

import {
  formatIndianCurrency,
  getGridProgress,
  getGridTier,
  normaliseAmount,
  rupeesToCreds,
  type GridCouponRecord,
  type GridDashboardData,
  type GridMemberLedger,
  type GridOrderSummary,
} from "@/lib/grid";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { getRepository } from "@/server/storage/repository";
import {
  getContactById,
  getMemberById,
  queryAllMembers,
  searchOrdersByIdentity,
  type WixContact,
  type WixMember,
  type WixOrder,
} from "@/server/wix";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayMonthDay() {
  const now = new Date();
  return `${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function extractBirthdayMonthDay(contact: WixContact | null): string | null {
  const bd = contact?.info?.birthdate;
  if (!bd) return null;
  const parts = bd.split("-");
  if (parts.length < 3) return null;
  const [, month, day] = parts;
  return month && day ? `${month}-${day}` : null;
}

/**
 * Priority: nickname → member full name → CRM full name → loginEmail → "GRID_USER"
 */
function resolveUsername(member: WixMember, contact: WixContact | null): string {
  if (member.profile?.nickname?.trim()) return member.profile.nickname.trim();

  const mFirst = member.contact?.firstName?.trim() ?? "";
  const mLast  = member.contact?.lastName?.trim()  ?? "";
  const memberFull = [mFirst, mLast].filter(Boolean).join(" ");
  if (memberFull) return memberFull;

  const cFirst = contact?.info?.name?.first?.trim() ?? "";
  const cLast  = contact?.info?.name?.last?.trim()  ?? "";
  const contactFull = [cFirst, cLast].filter(Boolean).join(" ");
  if (contactFull) return contactFull;

  if (member.loginEmail?.trim()) return member.loginEmail.trim();
  return "GRID_USER";
}

/**
 * Determine whether an order qualifies for Cred calculation.
 */
function isEligibleOrder(order: WixOrder): boolean {
  const status = (order.status ?? "").toUpperCase();
  const payment = (order.paymentStatus ?? "").toUpperCase();
  if (["CANCELED", "INITIALIZED", "CHECKOUT_INITIATED", "DECLINED"].includes(status)) return false;
  if (["NOT_PAID", "UNPAID", "AWAITING_PAYMENT"].includes(payment)) return false;
  return true;
}

/**
 * Extract order total — handles string "1500.00" and nested field variations.
 */
function extractOrderTotal(order: WixOrder): number {
  // Primary path
  const primary = order.priceSummary?.total?.amount;
  if (primary !== undefined && primary !== null) return normaliseAmount(primary);

  // Fallback 1: totalPrice
  const tp = order.priceSummary?.totalPrice?.amount;
  if (tp !== undefined && tp !== null) return normaliseAmount(tp);

  // Fallback 2: subtotal
  const sub = order.priceSummary?.subtotal?.amount;
  if (sub !== undefined && sub !== null) return normaliseAmount(sub);

  // Fallback 3: totals.total
  const t = order.totals?.total;
  if (t !== undefined && t !== null) return normaliseAmount(t);

  return 0;
}

function toOrderSummary(order: WixOrder): GridOrderSummary {
  return {
    id: order.id,
    number: order.number ?? order.id,
    total: extractOrderTotal(order),
    currency: order.priceSummary?.total?.currency ?? "INR",
    purchasedDate: order.purchasedDate ?? null,
    status: order.status ?? "UNKNOWN",
    paymentStatus: order.paymentStatus ?? "UNKNOWN",
    items:
      order.lineItems
        ?.map((item) => item.productName?.original)
        .filter((n): n is string => Boolean(n)) ?? [],
  };
}

function isLedgerStale(ledger: GridMemberLedger): boolean {
  const env = getEnv();
  return Date.now() - new Date(ledger.syncedAt).getTime() > env.SYNC_STALE_HOURS * 3_600_000;
}

function toDashboardData(
  ledger: GridMemberLedger,
  coupons: GridCouponRecord[],
  leaderboard: Awaited<ReturnType<ReturnType<typeof getRepository>["listTopMembers"]>>
): GridDashboardData {
  const currentTier = getGridTier(ledger.lifetimeCreds);
  const progress   = getGridProgress(ledger.lifetimeCreds);
  const nextTier   = progress.remaining > 0 ? getGridTier(ledger.lifetimeCreds + progress.remaining) : null;

  return {
    member: {
      memberId:  ledger.memberId,
      contactId: ledger.contactId,
      username:  ledger.username,
      email:     ledger.email,
    },
    wallet: {
      totalPurchaseValue: ledger.totalPurchaseValue,
      purchaseCreds:      ledger.purchaseCreds,
      bonusCreds:         ledger.bonusCreds,
      lifetimeCreds:      ledger.lifetimeCreds,
      redeemedCreds:      ledger.redeemedCreds,
      availableCreds:     ledger.availableCreds,
      level:              currentTier,
      nextLevel:          nextTier,
      progressRatio:      progress.ratio,
      credsToNextLevel:   progress.remaining,
    },
    orders:      ledger.orders,
    coupons,
    leaderboard,
    system: {
      syncWindowLabel: "24-48 hrs",
      syncedAt:        ledger.syncedAt,
      connection:      "ONLINE",
    },
  };
}

// ─── Core sync ────────────────────────────────────────────────────────────────

export async function syncMemberById(memberId: string): Promise<GridMemberLedger> {
  const env   = getEnv();
  const repo  = getRepository();
  const existing = await repo.getMemberLedger(memberId);

  // ── 1. Fetch Wix identity ──────────────────────────────────────────────
  const member = await getMemberById(memberId);

  let contact: WixContact | null = null;
  if (member.contactId) {
    try {
      contact = await getContactById(member.contactId);
    } catch {
      console.warn("[THE_GRID_SYNC] Contact fetch failed for", member.contactId);
    }
  }

  const email =
    member.loginEmail?.trim() ||
    existing?.email ||
    contact?.primaryInfo?.email ||
    "";

  // ── 2. Fetch + aggregate orders ────────────────────────────────────────
  const rawOrders = await searchOrdersByIdentity({
    memberId,
    contactId: member.contactId,
    email,
  });

  const orders = rawOrders.filter(isEligibleOrder).map(toOrderSummary);
  const totalPurchaseValue = orders.reduce((sum, o) => sum + o.total, 0);
  const purchaseCreds = rupeesToCreds(totalPurchaseValue);

  // ── 3. Bonus Creds (idempotent) ────────────────────────────────────────
  let bonusCreds = existing?.bonusCreds ?? 0;
  let welcomeBonusGrantedAt = existing?.welcomeBonusGrantedAt ?? null;
  let birthdayBonusYears = existing?.birthdayBonusYears ?? [];

  if (!welcomeBonusGrantedAt) {
    welcomeBonusGrantedAt = new Date().toISOString();
    bonusCreds += env.WELCOME_BONUS_CREDITS;
  }

  const birthdayMonthDay = extractBirthdayMonthDay(contact);
  const currentYear = new Date().getUTCFullYear();

  if (
    birthdayMonthDay &&
    birthdayMonthDay === getTodayMonthDay() &&
    !birthdayBonusYears.includes(currentYear)
  ) {
    birthdayBonusYears = [...birthdayBonusYears, currentYear];
    bonusCreds += env.BIRTHDAY_BONUS_CREDITS;
  }

  // ── 4. Phase 2 cleanup: restore creds from LOCAL_ONLY coupons ──────────
  // LOCAL_ONLY entries were created by the old broken code path that deducted
  // creds even when Wix coupon creation failed. We restore those creds now
  // and mark the entries as FAILED so they don't get double-restored.
  const localOnlyCoupons = await repo.listCouponsByStatus(memberId, "LOCAL_ONLY");
  const credsToRestore = localOnlyCoupons.reduce((sum, c) => sum + c.credsSpent, 0);

  let redeemedCreds = existing?.redeemedCreds ?? 0;
  if (credsToRestore > 0) {
    redeemedCreds = Math.max(redeemedCreds - credsToRestore, 0);
    await repo.markCouponsAsFailed(memberId, "LOCAL_ONLY");
    console.info(
      `[THE_GRID_CLEANUP] Restored ${credsToRestore} Creds from ${localOnlyCoupons.length} LOCAL_ONLY coupons for member ${memberId}`
    );
  }

  // ── 5. Compute final totals ────────────────────────────────────────────
  const lifetimeCreds  = purchaseCreds + bonusCreds;
  const availableCreds = Math.max(lifetimeCreds - redeemedCreds, 0);
  const now = new Date().toISOString();

  const ledger: GridMemberLedger = {
    memberId,
    contactId:              member.contactId ?? null,
    email,
    username:               resolveUsername(member, contact),
    birthdayMonthDay,
    welcomeBonusGrantedAt,
    birthdayBonusYears,
    totalPurchaseValue,
    purchaseCreds,
    bonusCreds,
    lifetimeCreds,
    redeemedCreds,
    availableCreds,
    level:      getGridTier(lifetimeCreds).key,
    orderCount: orders.length,
    orders:     orders.slice(0, 8),
    createdAt:  existing?.createdAt ?? now,
    updatedAt:  now,
    syncedAt:   now,
  };

  await repo.upsertMemberLedger(ledger);
  return ledger;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getDashboardForMember(
  memberId: string,
  forceSync = false
): Promise<GridDashboardData> {
  const repo = getRepository();
  let ledger = await repo.getMemberLedger(memberId);

  if (!ledger || forceSync || isLedgerStale(ledger)) {
    ledger = await syncMemberById(memberId);
  }

  const [coupons, leaderboard] = await Promise.all([
    repo.listCouponsByMember(memberId, 6),
    repo.listTopMembers(5),
  ]);

  return toDashboardData(ledger, coupons, leaderboard);
}

export async function syncAllMembers(): Promise<{
  total: number; synced: number; failed: number;
}> {
  const members = await queryAllMembers();
  let synced = 0, failed = 0;
  for (const m of members) {
    try { await syncMemberById(m.id); synced++; }
    catch (e) { failed++; console.error("[THE_GRID_BULK_SYNC_FAILED]", m.id, e); }
  }
  return { total: members.length, synced, failed };
}

export async function assertLedgerExists(memberId: string): Promise<GridMemberLedger> {
  const ledger = await getRepository().getMemberLedger(memberId);
  if (!ledger) {
    throw new AppError("No loyalty ledger found for this member. Trigger a sync first.", 404);
  }
  return ledger;
}
