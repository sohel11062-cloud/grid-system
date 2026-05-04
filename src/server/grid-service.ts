import "server-only";

import {
  formatIndianCurrency,
  getGridProgress,
  getGridTier,
  normaliseAmount,
  rupeesToCreds,
  type CreditTransaction,
  type GridCouponRecord,
  type GridDashboardData,
  type GridMemberLedger,
  type GridOrderSummary,
  type LifetimeStats,
} from "@/lib/grid";
import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { ledgerService } from "@/server/ledger-service";
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

// ─── Per-member sync lock ─────────────────────────────────────────────────────

class AsyncLockMap {
  private readonly locks = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve(null);
    let resolveLock!: () => void;
    const slot = new Promise<void>((r) => { resolveLock = r; });
    this.locks.set(key, slot);
    try {
      await prev.catch(() => {});
      return await fn();
    } finally {
      resolveLock();
      if (this.locks.get(key) === slot) this.locks.delete(key);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __GRID_SYNC_LOCK__: AsyncLockMap | undefined;
}
function getSyncLock(): AsyncLockMap {
  if (!global.__GRID_SYNC_LOCK__) global.__GRID_SYNC_LOCK__ = new AsyncLockMap();
  return global.__GRID_SYNC_LOCK__;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayMMDD(): string {
  const d = new Date();
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function birthdayMMDD(contact: WixContact | null): string | null {
  const bd = contact?.info?.birthdate;
  if (!bd) return null;
  const parts = bd.split("-");
  if (parts.length < 3) return null;
  const [, mm, dd] = parts;
  return mm && dd ? `${mm}-${dd}` : null;
}

function resolveUsername(member: WixMember, contact: WixContact | null): string {
  const nick = member.profile?.nickname?.trim();
  if (nick) return nick;

  const mFull = [member.contact?.firstName, member.contact?.lastName]
    .map((s) => s?.trim() ?? "").filter(Boolean).join(" ");
  if (mFull) return mFull;

  const cFull = [contact?.info?.name?.first, contact?.info?.name?.last]
    .map((s) => s?.trim() ?? "").filter(Boolean).join(" ");
  if (cFull) return cFull;

  return member.loginEmail?.trim() || "GRID_USER";
}

function isEligibleOrder(order: WixOrder): boolean {
  const st = (order.status        ?? "").toUpperCase();
  const ps = (order.paymentStatus ?? "").toUpperCase();
  if (["CANCELED", "INITIALIZED", "CHECKOUT_INITIATED", "DECLINED"].includes(st)) return false;
  if (["NOT_PAID", "UNPAID", "AWAITING_PAYMENT"].includes(ps)) return false;
  return true;
}

function extractOrderTotal(order: WixOrder): number {
  const candidates = [
    order.priceSummary?.total?.amount,
    order.priceSummary?.totalPrice?.amount,
    order.priceSummary?.subtotal?.amount,
    order.totals?.total,
  ];
  for (const v of candidates) {
    if (v === undefined || v === null) continue;
    const n = normaliseAmount(v);
    if (n > 0) return n;
  }
  return 0;
}

function toOrderSummary(order: WixOrder): GridOrderSummary {
  return {
    id:            order.id,
    number:        order.number    ?? order.id,
    total:         extractOrderTotal(order),
    currency:      order.priceSummary?.total?.currency ?? "INR",
    purchasedDate: order.purchasedDate ?? null,
    status:        order.status        ?? "UNKNOWN",
    paymentStatus: order.paymentStatus ?? "UNKNOWN",
    items:
      order.lineItems
        ?.map((i) => i.productName?.original)
        .filter((n): n is string => Boolean(n)) ?? [],
    couponCode: order.appliedCoupon?.code, // NEW
  };
}

function isStale(ledger: GridMemberLedger): boolean {
  const { SYNC_STALE_HOURS } = getEnv();
  return Date.now() - new Date(ledger.syncedAt).getTime() > SYNC_STALE_HOURS * 3_600_000;
}

function buildLifetimeStats(coupons: GridCouponRecord[]): LifetimeStats {
  // Expire check at display time (belt-and-suspenders against stale status)
  const now = new Date().toISOString();
  return {
    totalSavingsRupees:  coupons.filter((c) => c.status === "USED").reduce((s, c) => s + c.valueRupees, 0),
    totalCouponsUsed:    coupons.filter((c) => c.status === "USED").length,
    totalCouponsActive:  coupons.filter((c) => c.status === "ACTIVE" && (!c.expiresAt || c.expiresAt > now)).length,
    totalCouponsExpired: coupons.filter((c) => c.status === "EXPIRED" || (c.status === "ACTIVE" && !!c.expiresAt && c.expiresAt <= now)).length,
  };
}

function buildDashboard(
  ledger:       GridMemberLedger,
  coupons:      GridCouponRecord[],
  leaderboard:  GridLeaderboardEntry[],
  transactions: CreditTransaction[]
): GridDashboardData {
  type GridLeaderboardEntry = Awaited<ReturnType<ReturnType<typeof getRepository>["listTopMembers"]>>[number];

  const tier     = getGridTier(ledger.lifetimeCreds);
  const progress = getGridProgress(ledger.lifetimeCreds);
  const nextTier = progress.remaining > 0 ? getGridTier(ledger.lifetimeCreds + progress.remaining) : null;

  const visibleCoupons = coupons.filter((c) => c.status !== "FAILED");

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
      level:              tier,
      nextLevel:          nextTier,
      progressRatio:      progress.ratio,
      credsToNextLevel:   progress.remaining,
    },
    orders:             ledger.orders,
    coupons:            visibleCoupons,
    leaderboard:        leaderboard as unknown as GridLeaderboardEntry[],
    recentTransactions: transactions,
    lifetimeStats:      buildLifetimeStats(visibleCoupons),
    system: {
      syncWindowLabel: "24-48 hrs",
      syncedAt:        ledger.syncedAt,
      connection:      "ONLINE",
    },
  };
}

// ─── Core sync (under per-member lock) ───────────────────────────────────────

async function _syncUnsafe(memberId: string): Promise<GridMemberLedger> {
  const env      = getEnv();
  const repo     = getRepository();
  const existing = await repo.getMemberLedger(memberId);

  // ── 1. Identity ────────────────────────────────────────────────────────
  const member = await getMemberById(memberId);

  let contact: WixContact | null = null;
  if (member.contactId) {
    try { contact = await getContactById(member.contactId); }
    catch { console.warn("[THE_GRID_SYNC] Contact fetch failed:", member.contactId); }
  }

  const email =
    member.loginEmail?.trim() || existing?.email || contact?.primaryInfo?.email || "";

  // ── 2. Orders — fetch + de-duplicate ──────────────────────────────────
  const rawOrders = await searchOrdersByIdentity({ memberId, contactId: member.contactId, email });

  const seenIds = new Set<string>();
  const uniqueRaw = rawOrders.filter((o) => {
    if (seenIds.has(o.id)) return false;
    seenIds.add(o.id);
    return true;
  });

  const eligibleOrders     = uniqueRaw.filter(isEligibleOrder).map(toOrderSummary);
  const totalPurchaseValue = eligibleOrders.reduce((s, o) => s + o.total, 0);
  const purchaseCreds      = rupeesToCreds(totalPurchaseValue);

  // ── 3. Bonus Creds (idempotent) ────────────────────────────────────────
  let bonusCreds                 = existing?.bonusCreds            ?? 0;
  let welcomeBonusGrantedAt      = existing?.welcomeBonusGrantedAt ?? null;
  let birthdayBonusYears         = existing?.birthdayBonusYears    ?? [];
  let grantedWelcomeThisSync     = false;
  let grantedBirthdayThisSync    = false;

  if (!welcomeBonusGrantedAt) {
    welcomeBonusGrantedAt   = new Date().toISOString();
    bonusCreds             += env.WELCOME_BONUS_CREDITS;
    grantedWelcomeThisSync  = true;
  }

  const bDay = birthdayMMDD(contact);
  const year = new Date().getUTCFullYear();
  if (bDay && bDay === todayMMDD() && !birthdayBonusYears.includes(year)) {
    birthdayBonusYears          = [...birthdayBonusYears, year];
    bonusCreds                 += env.BIRTHDAY_BONUS_CREDITS;
    grantedBirthdayThisSync     = true;
  }

  // ── 4. Compute final balance ────────────────────────────────────────────
  const lifetimeCreds  = purchaseCreds + bonusCreds;
  const redeemedCreds  = existing?.redeemedCreds ?? 0;
  const availableCreds = Math.max(lifetimeCreds - redeemedCreds, 0);
  const now            = new Date().toISOString();

  const ledger: GridMemberLedger = {
    memberId,
    contactId:            member.contactId ?? null,
    email,
    username:             resolveUsername(member, contact),
    birthdayMonthDay:     bDay,
    welcomeBonusGrantedAt,
    birthdayBonusYears,
    totalPurchaseValue,
    purchaseCreds,
    bonusCreds,
    lifetimeCreds,
    redeemedCreds,
    availableCreds,
    level:      getGridTier(lifetimeCreds).key,
    orderCount: eligibleOrders.length,
    orders:     eligibleOrders.slice(0, 8),
    createdAt:  existing?.createdAt ?? now,
    updatedAt:  now,
    syncedAt:   now,
  };

  await repo.upsertMemberLedger(ledger);

  // ── 5. NEW: Process new orders → order_history + EARN transactions ──────
  const processedIds = await repo.getProcessedOrderIds(memberId);

  // Map rawOrder id → full WixOrder for coupon lookup
  const rawOrderMap = new Map(uniqueRaw.map((o) => [o.id, o]));

  for (const order of eligibleOrders) {
    if (processedIds.has(order.id)) continue; // already processed

    const rawOrder    = rawOrderMap.get(order.id);
    const couponCode  = rawOrder?.appliedCoupon?.code;
    const credsEarned = rupeesToCreds(order.total); // ₹1 = 1 Cred

    // Save to order_history (unique index on orderId prevents duplicates)
    await repo.saveOrderHistory({
      orderId:    order.id,
      memberId,
      amount:     order.total,
      currency:   order.currency,
      couponCode,
      credsEarned,
      createdAt:  order.purchasedDate ?? now,
      syncedAt:   now,
    });

    // Record EARN transaction
    if (credsEarned > 0) {
      await ledgerService.recordEarnFromOrder(memberId, credsEarned, availableCreds, order.id);
    }

    // Mark coupon as USED if this order applied one (idempotent)
    if (couponCode) {
      const marked = await repo.markCouponUsed(couponCode, order.id, now);
      if (marked) {
        console.info("[THE_GRID_SYNC] Coupon marked USED:", { couponCode, orderId: order.id, memberId });
      }
    }
  }

  // ── 6. NEW: Record bonus transactions if granted this sync ─────────────
  if (grantedWelcomeThisSync) {
    await ledgerService.recordBonus(
      memberId, env.WELCOME_BONUS_CREDITS, availableCreds, "WELCOME_BONUS"
    );
  }
  if (grantedBirthdayThisSync) {
    await ledgerService.recordBonus(
      memberId, env.BIRTHDAY_BONUS_CREDITS, availableCreds, `BIRTHDAY_${year}`
    );
  }

  // ── 7. NEW: Expire stale coupons ────────────────────────────────────────
  const expired = await repo.expireStaleCoupons(memberId, now);
  if (expired > 0) {
    console.info(`[THE_GRID_SYNC] Expired ${expired} coupon(s) for member ${memberId}`);
  }

  return ledger;
}

export async function syncMemberById(memberId: string): Promise<GridMemberLedger> {
  return getSyncLock().run(memberId, () => _syncUnsafe(memberId));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getDashboardForMember(
  memberId:  string,
  forceSync  = false
): Promise<GridDashboardData> {
  const repo = getRepository();
  let ledger = await repo.getMemberLedger(memberId);

  if (!ledger || forceSync || isStale(ledger)) {
    ledger = await syncMemberById(memberId);
  }

  const [coupons, leaderboard, transactions] = await Promise.all([
    repo.listCouponsByMember(memberId, 8),
    repo.listTopMembers(5),
    repo.listCreditTransactions(memberId, { limit: 10 }), // last 10 for dashboard
  ]);

  return buildDashboard(ledger, coupons, leaderboard as never, transactions);
}

export async function syncAllMembers(): Promise<{
  total:  number;
  synced: number;
  failed: number;
}> {
  const members = await queryAllMembers();
  let synced = 0, failed = 0;

  for (const m of members) {
    try {
      await syncMemberById(m.id);
      synced++;
    } catch (e) {
      failed++;
      console.error("[THE_GRID_BULK_SYNC_FAILED]", m.id, e instanceof Error ? e.message : e);
    }
  }

  return { total: members.length, synced, failed };
}

export async function assertLedgerExists(memberId: string): Promise<GridMemberLedger> {
  const ledger = await getRepository().getMemberLedger(memberId);
  if (!ledger) {
    throw new AppError(
      "No loyalty ledger found. Trigger a sync first.",
      404,
      ErrorCode.LEDGER_NOT_FOUND
    );
  }
  return ledger;
}

// Explicit re-export for type inference in buildDashboard
type GridLeaderboardEntry = import("@/lib/grid").GridLeaderboardEntry;