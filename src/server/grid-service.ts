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

// ─── Utility helpers ─────────────────────────────────────────────────────────

function getTodayMonthDay() {
  const now = new Date();
  return `${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate()
  ).padStart(2, "0")}`;
}

function extractBirthdayMonthDay(contact: WixContact | null): string | null {
  const birthdate = contact?.info?.birthdate;
  if (!birthdate) return null;

  // birthdate format from Wix: "YYYY-MM-DD"
  const parts = birthdate.split("-");
  if (parts.length < 3) return null;
  const [, month, day] = parts;
  if (!month || !day) return null;
  return `${month}-${day}`;
}

/**
 * Priority: nickname → full name (member contact fields) →
 *           full name (CRM contact fields) → loginEmail → fallback
 */
function resolveUsername(
  member: WixMember,
  contact: WixContact | null
): string {
  if (member.profile?.nickname?.trim()) {
    return member.profile.nickname.trim();
  }

  const memberFirst = member.contact?.firstName?.trim() ?? "";
  const memberLast = member.contact?.lastName?.trim() ?? "";
  const memberFullName = [memberFirst, memberLast].filter(Boolean).join(" ");
  if (memberFullName) return memberFullName;

  const contactFirst = contact?.info?.name?.first?.trim() ?? "";
  const contactLast = contact?.info?.name?.last?.trim() ?? "";
  const contactFullName = [contactFirst, contactLast].filter(Boolean).join(" ");
  if (contactFullName) return contactFullName;

  if (member.loginEmail?.trim()) return member.loginEmail.trim();

  return "GRID_USER";
}

function isEligibleOrder(order: WixOrder): boolean {
  const status = (order.status ?? "").toUpperCase();
  const paymentStatus = (order.paymentStatus ?? "").toUpperCase();

  // Exclude cancelled / un-started orders.
  if (["CANCELED", "INITIALIZED", "CHECKOUT_INITIATED", "DECLINED"].includes(status)) {
    return false;
  }

  // Exclude unpaid orders.
  if (["NOT_PAID", "UNPAID", "AWAITING_PAYMENT"].includes(paymentStatus)) {
    return false;
  }

  return true;
}

function toOrderSummary(order: WixOrder): GridOrderSummary {
  const rawAmount = order.priceSummary?.total?.amount;
  const total = normaliseAmount(rawAmount);

  return {
    id: order.id,
    number: order.number ?? order.id,
    total,
    currency: order.priceSummary?.total?.currency ?? "INR",
    purchasedDate: order.purchasedDate ?? null,
    status: order.status ?? "UNKNOWN",
    paymentStatus: order.paymentStatus ?? "UNKNOWN",
    items:
      order.lineItems
        ?.map((item) => item.productName?.original)
        .filter((name): name is string => Boolean(name)) ?? [],
  };
}

function isLedgerStale(ledger: GridMemberLedger): boolean {
  const env = getEnv();
  const ageMs = Date.now() - new Date(ledger.syncedAt).getTime();
  return ageMs > env.SYNC_STALE_HOURS * 60 * 60 * 1000;
}

function toDashboardData(
  ledger: GridMemberLedger,
  coupons: GridCouponRecord[],
  leaderboard: Awaited
    ReturnType<ReturnType<typeof getRepository>["listTopMembers"]>
  >
): GridDashboardData {
  const currentTier = getGridTier(ledger.lifetimeCreds);
  const progress = getGridProgress(ledger.lifetimeCreds);
  const nextTier =
    progress.remaining > 0
      ? getGridTier(ledger.lifetimeCreds + progress.remaining)
      : null;

  return {
    member: {
      memberId: ledger.memberId,
      contactId: ledger.contactId,
      username: ledger.username,
      email: ledger.email,
    },
    wallet: {
      totalPurchaseValue: ledger.totalPurchaseValue,
      purchaseCreds: ledger.purchaseCreds,
      bonusCreds: ledger.bonusCreds,
      lifetimeCreds: ledger.lifetimeCreds,
      redeemedCreds: ledger.redeemedCreds,
      availableCreds: ledger.availableCreds,
      level: currentTier,
      nextLevel: nextTier,
      progressRatio: progress.ratio,
      credsToNextLevel: progress.remaining,
    },
    orders: ledger.orders,
    coupons,
    leaderboard,
    system: {
      syncWindowLabel: "24-48 hrs",
      syncedAt: ledger.syncedAt,
      connection: "ONLINE",
    },
  };
}

// ─── Core sync logic ─────────────────────────────────────────────────────────

export async function syncMemberById(memberId: string): Promise<GridMemberLedger> {
  const env = getEnv();
  const repo = getRepository();
  const existing = await repo.getMemberLedger(memberId);

  // ── 1. Fetch member & contact from Wix ──────────────────────────────────
  const member = await getMemberById(memberId);

  let contact: WixContact | null = null;
  if (member.contactId) {
    try {
      contact = await getContactById(member.contactId);
    } catch {
      // Contact is enrichment data — don't block sync if unavailable.
      console.warn(`[THE_GRID_SYNC] Could not fetch contact ${member.contactId}`);
    }
  }

  // ── 2. Derive email ──────────────────────────────────────────────────────
  const email =
    member.loginEmail?.trim() ||
    existing?.email ||
    contact?.primaryInfo?.email ||
    "";

  // ── 3. Fetch & aggregate orders ──────────────────────────────────────────
  const rawOrders = await searchOrdersByIdentity({
    memberId,
    contactId: member.contactId,
    email,
  });

  const orders = rawOrders.filter(isEligibleOrder).map(toOrderSummary);
  const totalPurchaseValue = orders.reduce((sum, o) => sum + o.total, 0);
  const purchaseCreds = rupeesToCreds(totalPurchaseValue);

  // ── 4. Bonus Creds (idempotent) ──────────────────────────────────────────
  let bonusCreds = existing?.bonusCreds ?? 0;
  let welcomeBonusGrantedAt = existing?.welcomeBonusGrantedAt ?? null;
  let birthdayBonusYears = existing?.birthdayBonusYears ?? [];

  // Welcome bonus — only once ever.
  if (!welcomeBonusGrantedAt) {
    welcomeBonusGrantedAt = new Date().toISOString();
    bonusCreds += env.WELCOME_BONUS_CREDITS;
  }

  // Birthday bonus — once per calendar year.
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

  // ── 5. Compute totals ────────────────────────────────────────────────────
  const lifetimeCreds = purchaseCreds + bonusCreds;
  const redeemedCreds = existing?.redeemedCreds ?? 0;
  const availableCreds = Math.max(lifetimeCreds - redeemedCreds, 0);
  const now = new Date().toISOString();

  const ledger: GridMemberLedger = {
    memberId,
    contactId: member.contactId ?? null,
    email,
    username: resolveUsername(member, contact),
    birthdayMonthDay,
    welcomeBonusGrantedAt,
    birthdayBonusYears,
    totalPurchaseValue,
    purchaseCreds,
    bonusCreds,
    lifetimeCreds,
    redeemedCreds,
    availableCreds,
    level: getGridTier(lifetimeCreds).key,
    orderCount: orders.length,
    orders: orders.slice(0, 8),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncedAt: now,
  };

  await repo.upsertMemberLedger(ledger);
  return ledger;
}

// ─── Public API ──────────────────────────────────────────────────────────────

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
  total: number;
  synced: number;
  failed: number;
}> {
  const members = await queryAllMembers();
  let synced = 0;
  let failed = 0;

  for (const member of members) {
    try {
      await syncMemberById(member.id);
      synced++;
    } catch (error) {
      failed++;
      console.error("[THE_GRID_SYNC_MEMBER_FAILED]", member.id, error);
    }
  }

  return { total: members.length, synced, failed };
}

export async function assertLedgerExists(memberId: string): Promise<GridMemberLedger> {
  const repo = getRepository();
  const ledger = await repo.getMemberLedger(memberId);

  if (!ledger) {
    throw new AppError(
      `No loyalty ledger found for this member. Trigger a sync first.`,
      404
    );
  }

  return ledger;
}
