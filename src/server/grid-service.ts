import "server-only";

import {
  getGridProgress,
  getGridTier,
  normaliseAmount,
  rupeesToCreds,
  type CreditTransaction,
  type GridCouponRecord,
  type GridDashboardData,
  type GridLeaderboardEntry,
  type GridMemberLedger,
  type GridOrderSummary,
  type LifetimeStats,
} from "@/lib/grid";
import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { ledgerService } from "@/server/ledger-service";
import { logError, logInfo, logWarn, MSG } from "@/server/brand";
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

/**
 * Resolves a display name from the member + contact payloads.
 * NOTE: The admin REST API returns `_id`, not `id`.
 */
function resolveUsername(member: WixMember, contact: WixContact | null): string {
  return (
    member.profile?.nickname?.trim()                                                                          ||
    [member.contact?.firstName, member.contact?.lastName]
      .map((s) => s?.trim() ?? "").filter(Boolean).join(" ")                                                  ||
    [contact?.info?.name?.first, contact?.info?.name?.last]
      .map((s) => s?.trim() ?? "").filter(Boolean).join(" ")                                                  ||
    member.loginEmail?.trim()                                                                                 ||
    "GRID_USER"
  );
}

function isEligibleOrder(order: WixOrder): boolean {
  const st = (order.status        ?? "").toUpperCase();
  const ps = (order.paymentStatus ?? "").toUpperCase();
  if (["CANCELED", "INITIALIZED", "CHECKOUT_INITIATED", "DECLINED"].includes(st)) return false;
  if (["NOT_PAID", "UNPAID", "AWAITING_PAYMENT"].includes(ps)) return false;
  return true;
}

/**
 * Extracts the order total from all known Wix API response shapes.
 *
 * Shape A: `priceSummary.total = { amount: "1500.00" }` (nested object)
 * Shape B: `priceSummary.total = "1500.00"` (bare scalar)
 * Shape C: `totals.total = 1500` (legacy field)
 */
export function extractOrderTotal(order: WixOrder): number {
  const rawTotal = order.priceSummary?.total as unknown;

  const candidates: unknown[] = [
    // Shape A
    typeof rawTotal === "object" && rawTotal !== null
      ? (rawTotal as Record<string, unknown>).amount
      : undefined,
    // Shape B
    typeof rawTotal === "number" || typeof rawTotal === "string" ? rawTotal : undefined,
    // Fallbacks
    order.priceSummary?.totalPrice?.amount,
    order.priceSummary?.subtotal?.amount,
    order.totals?.total,
  ];

  for (const v of candidates) {
    if (v === null || v === undefined || v === "") continue;
    const n = normaliseAmount(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function extractCouponCode(order: WixOrder): string | null {
  const fromApplied = order.appliedCoupon?.code?.trim();
  if (fromApplied) return fromApplied;

  const raw = order as unknown as Record<string, unknown>;
  if (typeof raw.appliedCouponCode === "string" && raw.appliedCouponCode.trim())
    return raw.appliedCouponCode.trim();

  const discounts = raw.discounts as Array<{ coupon?: { code?: string } }> | undefined;
  const fromDiscount = discounts?.[0]?.coupon?.code?.trim();
  if (fromDiscount) return fromDiscount;

  return null;
}

function isCouponGenuinelyApplied(order: WixOrder): boolean {
  if (order.appliedCoupon?.couponId) return true;
  const discountAmount = order.appliedCoupon?.discount?.amount;
  if (discountAmount !== undefined) return normaliseAmount(discountAmount) > 0;
  return true;
}

function toOrderSummary(order: WixOrder): GridOrderSummary {
  return {
    id:            order.id,
    number:        order.number    ?? order.id,
    total:         extractOrderTotal(order),
    currency:
      (order.priceSummary?.total as { currency?: string } | null)?.currency ?? "INR",
    purchasedDate: order.purchasedDate ?? null,
    status:        order.status        ?? "UNKNOWN",
    paymentStatus: order.paymentStatus ?? "UNKNOWN",
    items:
      order.lineItems
        ?.map((i) => i.productName?.original)
        .filter((n): n is string => Boolean(n)) ?? [],
    couponCode: extractCouponCode(order) ?? undefined,
  };
}

function isStale(ledger: GridMemberLedger): boolean {
  return (
    Date.now() - new Date(ledger.syncedAt).getTime() >
    getEnv().SYNC_STALE_HOURS * 3_600_000
  );
}

function buildLifetimeStats(coupons: GridCouponRecord[]): LifetimeStats {
  const now = new Date().toISOString();
  return {
    totalSavingsRupees:
      coupons.filter((c) => c.status === "USED").reduce((s, c) => s + c.valueRupees, 0),
    totalCouponsUsed:
      coupons.filter((c) => c.status === "USED").length,
    totalCouponsActive:
      coupons.filter(
        (c) => c.status === "ACTIVE" && (!c.expiresAt || c.expiresAt > now),
      ).length,
    totalCouponsExpired:
      coupons.filter(
        (c) =>
          c.status === "EXPIRED" ||
          (c.status === "ACTIVE" && !!c.expiresAt && c.expiresAt <= now),
      ).length,
  };
}

function buildDashboard(
  ledger:       GridMemberLedger,
  coupons:      GridCouponRecord[],
  leaderboard:  GridLeaderboardEntry[],
  transactions: CreditTransaction[],
): GridDashboardData {
  const tier     = getGridTier(ledger.lifetimeCreds);
  const progress = getGridProgress(ledger.lifetimeCreds);
  const nextTier =
    progress.remaining > 0
      ? getGridTier(ledger.lifetimeCreds + progress.remaining)
      : null;
  const visible = coupons.filter((c) => c.status !== "FAILED");

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
    coupons:            visible,
    leaderboard,
    recentTransactions: transactions,
    lifetimeStats:      buildLifetimeStats(visible),
    system: {
      syncWindowLabel: "24-48 hrs",
      syncedAt:        ledger.syncedAt,
      connection:      "ONLINE",
    },
  };
}

// ─── Balance verification (diagnostic only — never throws) ───────────────────

async function verifyBalance(
  memberId: string,
  ledger:   GridMemberLedger,
): Promise<void> {
  try {
    const txs = await getRepository().listCreditTransactions(memberId, {
      limit: 100_000,
    });
    let earned = 0, redeemed = 0, bonus = 0;
    for (const tx of txs) {
      if (tx.type === "EARN")   earned   += tx.amount;
      if (tx.type === "REDEEM") redeemed += tx.amount;
      if (tx.type === "BONUS")  bonus    += tx.amount;
    }
    const computed = Math.max(earned + bonus - redeemed, 0);
    if (Math.abs(ledger.availableCreds - computed) > 0) {
      console.error("[GRID_RECONCILE] Balance mismatch!", {
        memberId,
        stored:   ledger.availableCreds,
        computed,
        delta:    ledger.availableCreds - computed,
      });
    }
  } catch { /* diagnostic only */ }
}

// ─── Core per-member sync ─────────────────────────────────────────────────────

async function _syncUnsafe(memberId: string): Promise<GridMemberLedger> {
  const env      = getEnv();
  const repo     = getRepository();
  const existing = await repo.getMemberLedger(memberId);

  logInfo(memberId, "SYNC_START", "RUNNING");

  // ── 1. Identity ────────────────────────────────────────────────────────────
  const member = await getMemberById(memberId);

  let contact: WixContact | null = null;
  if (member.contactId) {
    try {
      contact = await getContactById(member.contactId);
    } catch {
      logWarn(memberId, "FETCH_CONTACT", "Contact unavailable — skipping");
    }
  }

  const email =
    member.loginEmail?.trim() ||
    existing?.email            ||
    contact?.primaryInfo?.email ||
    "";

  // ── 2. Orders — fetch + de-duplicate ──────────────────────────────────────
  let rawOrders: WixOrder[] = [];
  try {
    rawOrders = await searchOrdersByIdentity({
      memberId,
      contactId: member.contactId,
      email,
    });
  } catch (e) {
    logError(memberId, "FETCH_ORDERS", e);
    if (existing) {
      logWarn(memberId, "FETCH_ORDERS", "Using cached ledger after order fetch failure");
      return existing;
    }
    throw e;
  }

  const seenIds   = new Set<string>();
  const uniqueRaw = rawOrders.filter((o) => {
    if (seenIds.has(o.id)) return false;
    seenIds.add(o.id);
    return true;
  });
  const eligible = uniqueRaw.filter(isEligibleOrder).map(toOrderSummary);

  const totalPurchaseValue = eligible.reduce((s, o) => s + o.total, 0);
  const purchaseCreds      = Math.floor(totalPurchaseValue); // ₹1 = 1 Cred

  // ── 3. Bonus Creds (idempotent) ────────────────────────────────────────────
  let bonusCreds              = existing?.bonusCreds            ?? 0;
  let welcomeBonusGrantedAt   = existing?.welcomeBonusGrantedAt ?? null;
  let birthdayBonusYears      = existing?.birthdayBonusYears    ?? [];
  let grantedWelcomeThisSync  = false;
  let grantedBirthdayThisSync = false;

  if (!welcomeBonusGrantedAt) {
    welcomeBonusGrantedAt  = new Date().toISOString();
    bonusCreds            += env.WELCOME_BONUS_CREDITS;
    grantedWelcomeThisSync = true;
  }

  const bDay = birthdayMMDD(contact);
  const year = new Date().getUTCFullYear();
  if (bDay && bDay === todayMMDD() && !birthdayBonusYears.includes(year)) {
    birthdayBonusYears          = [...birthdayBonusYears, year];
    bonusCreds                 += env.BIRTHDAY_BONUS_CREDITS;
    grantedBirthdayThisSync     = true;
  }

  // ── 4. Compute final balance ────────────────────────────────────────────────
  //   INVARIANT: lifetimeCreds  = purchaseCreds + bonusCreds
  //              availableCreds = lifetimeCreds  - redeemedCreds
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
    orderCount: eligible.length,
    orders:     eligible.slice(0, 8),
    createdAt:  existing?.createdAt ?? now,
    updatedAt:  now,
    syncedAt:   now,
  };

  await repo.upsertMemberLedger(ledger);

  // ── 5. Process new orders → order_history + EARN transactions ───────────────
  const processedIds = await repo.getProcessedOrderIds(memberId);
  const rawMap       = new Map(uniqueRaw.map((o) => [o.id, o]));
  let newCount       = 0;

  for (const order of eligible) {
    if (processedIds.has(order.id)) continue;

    const rawOrder    = rawMap.get(order.id);
    const couponCode  = rawOrder ? extractCouponCode(rawOrder) : null;
    const credsEarned = Math.floor(order.total);

    try {
      await repo.saveOrderHistory({
        orderId:    order.id,
        memberId,
        amount:     order.total,
        currency:   order.currency,
        couponCode: couponCode ?? undefined,
        credsEarned,
        createdAt:  order.purchasedDate ?? now,
        syncedAt:   now,
      });
    } catch (e) {
      logError(memberId, "SAVE_ORDER_HISTORY", e, { orderId: order.id });
      continue; // retry next sync
    }

    if (credsEarned > 0) {
      await ledgerService.recordEarnFromOrder(
        memberId,
        credsEarned,
        availableCreds,
        order.id,
      );
      logInfo(memberId, "ORDER_EARN", "OK", {
        orderId: order.id,
        credsEarned,
      });
    }

    if (couponCode && rawOrder && isCouponGenuinelyApplied(rawOrder)) {
      const marked = await repo.markCouponUsed(couponCode, order.id, now);
      if (marked) {
        logInfo(memberId, "COUPON_MARK_USED", "OK", {
          couponCode,
          orderId: order.id,
        });
      }
    }

    newCount++;
  }

  if (newCount > 0) {
    logInfo(memberId, "NEW_ORDERS_PROCESSED", "COMPLETE", { count: newCount });
  }

  // ── 6. Bonus transactions ──────────────────────────────────────────────────
  if (grantedWelcomeThisSync) {
    await ledgerService.recordBonus(
      memberId,
      env.WELCOME_BONUS_CREDITS,
      availableCreds,
      "WELCOME_BONUS",
    );
  }
  if (grantedBirthdayThisSync) {
    await ledgerService.recordBonus(
      memberId,
      env.BIRTHDAY_BONUS_CREDITS,
      availableCreds,
      `BIRTHDAY_${year}`,
    );
  }

  // ── 7. Expire stale coupons ────────────────────────────────────────────────
  const expired = await repo.expireStaleCoupons(memberId, now);
  if (expired > 0) {
    logInfo(memberId, "COUPONS_EXPIRED", "OK", { count: expired });
  }

  // ── 8. Balance verification (diagnostic) ──────────────────────────────────
  await verifyBalance(memberId, ledger);

  logInfo(memberId, "SYNC_COMPLETE", "OK", {
    lifetimeCreds,
    availableCreds,
    orders: eligible.length,
  });

  return ledger;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function syncMemberById(memberId: string): Promise<GridMemberLedger> {
  return getSyncLock().run(memberId, () => _syncUnsafe(memberId));
}

export async function getDashboardForMember(
  memberId:  string,
  forceSync  = false,
): Promise<GridDashboardData> {
  const repo = getRepository();
  let ledger = await repo.getMemberLedger(memberId);
  if (!ledger || forceSync || isStale(ledger)) {
    ledger = await syncMemberById(memberId);
  }

  const [coupons, leaderboard, transactions] = await Promise.all([
    repo.listCouponsByMember(memberId, 20),
    repo.listTopMembers(5),
    repo.listCreditTransactions(memberId, { limit: 10 }),
  ]);

  return buildDashboard(ledger, coupons, leaderboard, transactions);
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
      await syncMemberById(m._id);
      synced++;
    } catch (e) {
      failed++;
      logError(m._id, "BULK_SYNC", e);
    }
  }

  console.info("[GRID_SYNC] [BULK] [COMPLETE]", {
    total: members.length,
    synced,
    failed,
  });
  return { total: members.length, synced, failed };
}

export async function assertLedgerExists(memberId: string): Promise<GridMemberLedger> {
  const ledger = await getRepository().getMemberLedger(memberId);
  if (!ledger) {
    throw new AppError(MSG.LEDGER_NOT_FOUND, 404, ErrorCode.LEDGER_NOT_FOUND);
  }
  return ledger;
}