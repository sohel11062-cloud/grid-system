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
import { AppError, ErrorCode } from "@/server/errors";
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

// ─── Per-member sync lock (prevents concurrent syncs for same member) ─────────
//
// Uses promise chaining so concurrent calls for the same memberId queue up
// and execute sequentially. Each call waits for the previous to complete
// before starting, which prevents partial writes and duplicate-work.

class AsyncLockMap {
  // memberId → tail of the promise chain
  private readonly locks = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Chain onto whatever is currently running for this key
    const prev = this.locks.get(key) ?? Promise.resolve(null);

    let resolveLock!: () => void;
    // This promise represents the "slot" this call holds in the queue
    const slot = new Promise<void>((r) => { resolveLock = r; });

    // Register our slot as the new tail
    this.locks.set(key, slot);

    try {
      // Wait for the previous operation to finish (or fail — we don't care)
      await prev.catch(() => {});
      return await fn();
    } finally {
      resolveLock();
      // Clean up if we're still the tail (no one queued behind us)
      if (this.locks.get(key) === slot) {
        this.locks.delete(key);
      }
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __GRID_SYNC_LOCK__: AsyncLockMap | undefined;
}

function getSyncLock(): AsyncLockMap {
  if (!global.__GRID_SYNC_LOCK__) {
    global.__GRID_SYNC_LOCK__ = new AsyncLockMap();
  }
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
 * Priority: nickname → member name → CRM name → email → "GRID_USER"
 * Trims whitespace at every level to avoid " " matching as truthy.
 */
function resolveUsername(member: WixMember, contact: WixContact | null): string {
  const nickname = member.profile?.nickname?.trim();
  if (nickname) return nickname;

  const mFirst = member.contact?.firstName?.trim() ?? "";
  const mLast  = member.contact?.lastName?.trim()  ?? "";
  const mFull  = [mFirst, mLast].filter(Boolean).join(" ");
  if (mFull) return mFull;

  const cFirst = contact?.info?.name?.first?.trim() ?? "";
  const cLast  = contact?.info?.name?.last?.trim()  ?? "";
  const cFull  = [cFirst, cLast].filter(Boolean).join(" ");
  if (cFull) return cFull;

  const email = member.loginEmail?.trim();
  if (email) return email;

  return "GRID_USER";
}

/** Orders that should count toward purchase Creds */
function isEligibleOrder(order: WixOrder): boolean {
  const status  = (order.status        ?? "").toUpperCase();
  const payment = (order.paymentStatus ?? "").toUpperCase();

  if (["CANCELED", "INITIALIZED", "CHECKOUT_INITIATED", "DECLINED"].includes(status)) {
    return false;
  }
  if (["NOT_PAID", "UNPAID", "AWAITING_PAYMENT"].includes(payment)) {
    return false;
  }
  return true;
}

/**
 * Extract order total with multiple fallback paths.
 * Wix returns amounts as strings "1500.00" in some API versions.
 */
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
    number:        order.number ?? order.id,
    total:         extractOrderTotal(order),
    currency:      order.priceSummary?.total?.currency ?? "INR",
    purchasedDate: order.purchasedDate ?? null,
    status:        order.status        ?? "UNKNOWN",
    paymentStatus: order.paymentStatus ?? "UNKNOWN",
    items:
      order.lineItems
        ?.map((i) => i.productName?.original)
        .filter((n): n is string => Boolean(n)) ?? [],
  };
}

function isStale(ledger: GridMemberLedger): boolean {
  const { SYNC_STALE_HOURS } = getEnv();
  return Date.now() - new Date(ledger.syncedAt).getTime() > SYNC_STALE_HOURS * 3_600_000;
}

function buildDashboard(
  ledger:      GridMemberLedger,
  coupons:     GridCouponRecord[],
  leaderboard: GridMemberLedger extends infer _
    ? Awaited<ReturnType<ReturnType<typeof getRepository>["listTopMembers"]>>
    : never
): GridDashboardData {
  const tier     = getGridTier(ledger.lifetimeCreds);
  const progress = getGridProgress(ledger.lifetimeCreds);
  const nextTier = progress.remaining > 0
    ? getGridTier(ledger.lifetimeCreds + progress.remaining)
    : null;

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
    orders:      ledger.orders,
    // Hide FAILED coupons from the UI (kept in DB for audit only)
    coupons:     coupons.filter((c) => c.status !== "FAILED"),
    leaderboard,
    system: {
      syncWindowLabel: "24-48 hrs",
      syncedAt:        ledger.syncedAt,
      connection:      "ONLINE",
    },
  };
}

// ─── Core sync (protected by per-member lock) ─────────────────────────────────

async function _syncMemberByIdUnsafe(memberId: string): Promise<GridMemberLedger> {
  const env      = getEnv();
  const repo     = getRepository();
  const existing = await repo.getMemberLedger(memberId);

  // ── Identity ──────────────────────────────────────────────────────────────
  const member = await getMemberById(memberId);

  let contact: WixContact | null = null;
  if (member.contactId) {
    try {
      contact = await getContactById(member.contactId);
    } catch {
      // Contact is enrichment data — non-critical; log and continue
      console.warn("[THE_GRID_SYNC] Contact fetch failed for", member.contactId);
    }
  }

  const email =
    member.loginEmail?.trim()        ||
    existing?.email                  ||
    contact?.primaryInfo?.email      ||
    "";

  // ── Orders ────────────────────────────────────────────────────────────────
  const rawOrders = await searchOrdersByIdentity({
    memberId,
    contactId: member.contactId,
    email,
  });

  // De-duplicate by order ID in case the $or query returns the same order
  // matched by multiple identity fields (memberId AND email, for example)
  const seenIds = new Set<string>();
  const uniqueOrders = rawOrders.filter((o) => {
    if (seenIds.has(o.id)) return false;
    seenIds.add(o.id);
    return true;
  });

  const eligibleOrders     = uniqueOrders.filter(isEligibleOrder).map(toOrderSummary);
  const totalPurchaseValue = eligibleOrders.reduce((s, o) => s + o.total, 0);
  const purchaseCreds      = rupeesToCreds(totalPurchaseValue);

  // ── Bonus Creds (idempotent) ──────────────────────────────────────────────
  let bonusCreds            = existing?.bonusCreds            ?? 0;
  let welcomeBonusGrantedAt = existing?.welcomeBonusGrantedAt ?? null;
  let birthdayBonusYears    = existing?.birthdayBonusYears    ?? [];

  // Welcome bonus — exactly once, ever
  if (!welcomeBonusGrantedAt) {
    welcomeBonusGrantedAt = new Date().toISOString();
    bonusCreds += env.WELCOME_BONUS_CREDITS;
  }

  // Birthday bonus — once per calendar year
  const bDay = birthdayMMDD(contact);
  const year = new Date().getUTCFullYear();
  if (bDay && bDay === todayMMDD() && !birthdayBonusYears.includes(year)) {
    birthdayBonusYears = [...birthdayBonusYears, year];
    bonusCreds += env.BIRTHDAY_BONUS_CREDITS;
  }

  // ── Totals — invariant: availableCreds = lifetimeCreds - redeemedCreds ────
  const lifetimeCreds  = purchaseCreds + bonusCreds;
  // Preserve any creds already redeemed; do not reset them during a sync
  const redeemedCreds  = existing?.redeemedCreds ?? 0;
  const availableCreds = Math.max(lifetimeCreds - redeemedCreds, 0);
  const now = new Date().toISOString();

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
  return ledger;
}

/** Public sync — acquires per-member lock to prevent concurrent partial writes */
export async function syncMemberById(memberId: string): Promise<GridMemberLedger> {
  return getSyncLock().run(memberId, () => _syncMemberByIdUnsafe(memberId));
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

  const [coupons, leaderboard] = await Promise.all([
    repo.listCouponsByMember(memberId, 8),
    repo.listTopMembers(5),
  ]);

  return buildDashboard(ledger, coupons, leaderboard);
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
      console.error("[THE_GRID_BULK_SYNC_FAILED]", m.id,
        e instanceof Error ? e.message : e
      );
    }
  }

  return { total: members.length, synced, failed };
}

export async function assertLedgerExists(memberId: string): Promise<GridMemberLedger> {
  const ledger = await getRepository().getMemberLedger(memberId);
  if (!ledger) {
    throw new AppError(
      "No loyalty ledger found. Please trigger a sync first.",
      404,
      ErrorCode.LEDGER_NOT_FOUND
    );
  }
  return ledger;
}