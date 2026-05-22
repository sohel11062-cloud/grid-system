import "server-only";

import { MongoClient, type Db, type Filter } from "mongodb";
import type {
  AdminAction,
  AuditLog,
  CreditTransaction,
  GlobalStats,
  GridCouponRecord,
  GridCouponStatus,
  GridLeaderboardEntry,
  GridMemberLedger,
  GridTierKey,
  GridUser,
  GridUserRole,
  GridUserStatus,
  LeaderboardSnapshot,
  OrderHistory,
  RedemptionRecord,
  SyncJob,
} from "@/lib/grid";
import { getEnv } from "@/server/env";

// ─── Repository interface ─────────────────────────────────────────────────────

export interface GridRepository {
  // Users
  getUser(memberId: string): Promise<GridUser | null>;
  upsertUserFromLedger(
    ledger: GridMemberLedger,
    identity?: { roles?: GridUserRole[]; lastLoginAt?: string | null },
  ): Promise<GridUser>;
  listUsers(opts?: {
    limit?: number;
    skip?: number;
    query?: string;
    status?: GridUserStatus;
    role?: GridUserRole;
    fraudHold?: boolean;
  }): Promise<GridUser[]>;
  countUsers(opts?: { status?: GridUserStatus; fraudHold?: boolean }): Promise<number>;
  updateUserStatus(
    memberId: string,
    status: GridUserStatus,
    moderation: { actorMemberId: string; reason: string; now: string },
  ): Promise<GridUser | null>;
  grantUserRole(memberId: string, role: GridUserRole, now: string): Promise<GridUser | null>;
  setRankOverride(
    memberId: string,
    level: GridTierKey | null,
    reason: string,
    now: string,
  ): Promise<GridUser | null>;
  setFraudAssessment(
    memberId: string,
    fraud: Pick<GridMemberLedger, "fraudHold" | "fraudScore" | "fraudSignals">,
    now: string,
  ): Promise<void>;
  atomicCreditAdjustment(
    memberId: string,
    amount: number,
    now: string,
  ): Promise<GridMemberLedger | null>;

  // Ledger
  getMemberLedger(memberId: string): Promise<GridMemberLedger | null>;
  upsertMemberLedger(ledger: GridMemberLedger): Promise<GridMemberLedger>;
  atomicRedemption(
    memberId: string,
    creds:    number,
    now:      string,
  ): Promise<GridMemberLedger | null>;
  listTopMembers(limit: number): Promise<GridLeaderboardEntry[]>;
  listLeaderboardEntries(opts: {
    limit: number;
    skip?: number;
    includeSuspended?: boolean;
  }): Promise<GridLeaderboardEntry[]>;
  getMemberRank(memberId: string): Promise<{ rank: number | null; total: number }>;
  getGlobalStats(): Promise<GlobalStats>;
  getAllMemberIds(): Promise<string[]>;

  // Coupons
  listCouponsByMember(memberId: string, limit?: number): Promise<GridCouponRecord[]>;
  listCouponsByStatus(
    memberId: string,
    status:   GridCouponStatus,
  ): Promise<GridCouponRecord[]>;
  saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord>;
  markCouponUsed(
    code:    string,
    orderId: string,
    usedAt:  string,
  ): Promise<boolean>;
  expireStaleCoupons(memberId: string, now: string): Promise<number>;
  getCouponSummary(memberId: string): Promise<{
    total:              number;
    active:             number;
    used:               number;
    expired:            number;
    failed:             number;
    totalSavingsRupees: number;
  }>;

  // Transactions
  saveCreditTransaction(tx: CreditTransaction): Promise<void>;
  listCreditTransactions(
    memberId: string,
    opts?:    { limit?: number; skip?: number; since?: Date },
  ): Promise<CreditTransaction[]>;
  hasRedeemTransaction(memberId: string, referenceId: string): Promise<boolean>;
  getTransactionSummary(
    memberId: string,
    since:    Date,
  ): Promise<{ earned: number; redeemed: number; txCount: number }>;

  // Orders
  saveOrderHistory(order: OrderHistory): Promise<void>;
  getProcessedOrderIds(memberId: string): Promise<Set<string>>;

  // Redemptions
  getRedemptionByIdempotencyKey(
    memberId: string,
    idempotencyKey: string,
  ): Promise<RedemptionRecord | null>;
  saveRedemption(redemption: RedemptionRecord): Promise<RedemptionRecord>;
  updateRedemption(
    id: string,
    patch: Partial<Omit<RedemptionRecord, "id" | "createdAt">>,
  ): Promise<RedemptionRecord | null>;
  listRedemptions(opts?: {
    memberId?: string;
    status?: RedemptionRecord["status"];
    limit?: number;
    skip?: number;
  }): Promise<RedemptionRecord[]>;

  // Leaderboard snapshots
  getLatestLeaderboardSnapshot(): Promise<LeaderboardSnapshot | null>;
  saveLeaderboardSnapshot(snapshot: LeaderboardSnapshot): Promise<LeaderboardSnapshot>;

  // Audit / admin
  saveAuditLog(log: AuditLog): Promise<void>;
  listAuditLogs(opts?: { limit?: number; skip?: number; memberId?: string }): Promise<AuditLog[]>;
  saveAdminAction(action: AdminAction): Promise<AdminAction>;
  getAdminActionByIdempotencyKey(
    actorMemberId: string,
    idempotencyKey: string,
  ): Promise<AdminAction | null>;
  listAdminActions(opts?: { limit?: number; skip?: number; targetMemberId?: string }): Promise<AdminAction[]>;

  // Sync jobs
  saveSyncJob(job: SyncJob): Promise<SyncJob>;
  updateSyncJob(id: string, patch: Partial<Omit<SyncJob, "id" | "startedAt">>): Promise<void>;
  listSyncJobs(opts?: { limit?: number; skip?: number; type?: SyncJob["type"] }): Promise<SyncJob[]>;
}

// ─── Collection names ─────────────────────────────────────────────────────────

const COL_USERS                 = "users";
const COL_LEDGER                = "ledgers";
const COL_COUPONS               = "coupons";
const COL_ORDERS                = "order_history";
const COL_REDEMPTIONS           = "redemptions";
const COL_LEADERBOARD_SNAPSHOTS = "leaderboard_snapshots";
const COL_ADMIN_ACTIONS         = "admin_actions";
const COL_AUDIT_LOGS            = "audit_logs";
const COL_SYNC_JOBS             = "sync_jobs";

// ─── Globals ──────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __GRID_MONGO_CLIENT__:    Promise<MongoClient>  | undefined;
  // eslint-disable-next-line no-var
  var __GRID_INDEXES_ENSURED__: boolean               | undefined;
  // eslint-disable-next-line no-var
  var __GRID_MEM_REPO__:        MemoryGridRepository  | undefined;
  // eslint-disable-next-line no-var
  var __GRID_MONGO_REPO__:      MongoGridRepository   | undefined;
}

// ─── Index setup ──────────────────────────────────────────────────────────────

async function ensureIndexes(db: Db): Promise<void> {
  if (global.__GRID_INDEXES_ENSURED__) return;
  await Promise.allSettled([
    db.collection(COL_USERS).createIndex({ memberId: 1 },  { unique: true }),
    db.collection(COL_USERS).createIndex({ email: 1 }),
    db.collection(COL_USERS).createIndex({ roles: 1 }),
    db.collection(COL_USERS).createIndex({ status: 1, fraudHold: 1 }),
    db.collection(COL_USERS).createIndex({ lifetimeCreds: -1, updatedAt: -1 }),
    db.collection(COL_COUPONS).createIndex({ code: 1 },      { unique: true }),
    db.collection(COL_COUPONS).createIndex({ memberId: 1, status: 1 }),
    db.collection(COL_COUPONS).createIndex({ memberId: 1, createdAt: -1 }),
    db.collection(COL_COUPONS).createIndex({ expiresAt: 1 }),
    db.collection(COL_LEDGER).createIndex(
      { memberId: 1, referenceId: 1, type: 1 },
      { unique: true },
    ),
    db.collection(COL_LEDGER).createIndex({ memberId: 1, createdAt: -1 }),
    db.collection(COL_LEDGER).createIndex({ createdAt: -1 }),
    db.collection(COL_ORDERS).createIndex({ orderId: 1 },  { unique: true }),
    db.collection(COL_ORDERS).createIndex({ memberId: 1 }),
    db.collection(COL_ORDERS).createIndex({ memberId: 1, createdAt: -1 }),
    db.collection(COL_REDEMPTIONS).createIndex(
      { memberId: 1, idempotencyKey: 1 },
      { unique: true },
    ),
    db.collection(COL_REDEMPTIONS).createIndex({ status: 1, updatedAt: -1 }),
    db.collection(COL_LEADERBOARD_SNAPSHOTS).createIndex({ builtAt: -1 }),
    db.collection(COL_ADMIN_ACTIONS).createIndex(
      { actorMemberId: 1, idempotencyKey: 1 },
      { unique: true },
    ),
    db.collection(COL_ADMIN_ACTIONS).createIndex({ targetMemberId: 1, createdAt: -1 }),
    db.collection(COL_AUDIT_LOGS).createIndex({ createdAt: -1 }),
    db.collection(COL_AUDIT_LOGS).createIndex({ memberId: 1, createdAt: -1 }),
    db.collection(COL_SYNC_JOBS).createIndex({ type: 1, startedAt: -1 }),
  ]);
  global.__GRID_INDEXES_ENSURED__ = true;
}

// ─── In-memory implementation (dev / no MONGODB_URI) ─────────────────────────

function asUser(
  ledger: GridMemberLedger,
  existing?: GridUser | null,
  identity?: { roles?: GridUserRole[]; lastLoginAt?: string | null },
): GridUser {
  return {
    ...ledger,
    adjustmentCreds: ledger.adjustmentCreds ?? 0,
    achievements: ledger.achievements ?? existing?.achievements ?? [],
    fraudHold: ledger.fraudHold ?? existing?.fraudHold ?? false,
    fraudScore: ledger.fraudScore ?? existing?.fraudScore ?? 0,
    fraudSignals: ledger.fraudSignals ?? existing?.fraudSignals ?? [],
    roles: identity?.roles ?? existing?.roles ?? ["member"],
    status: existing?.status ?? "ACTIVE",
    lastLoginAt: identity?.lastLoginAt ?? existing?.lastLoginAt ?? null,
    moderatedAt: existing?.moderatedAt ?? null,
    moderatedBy: existing?.moderatedBy ?? null,
    moderationReason: existing?.moderationReason ?? null,
  };
}

function asLedger(user: GridUser): GridMemberLedger {
  const {
    roles: _roles,
    status: _status,
    lastLoginAt: _lastLoginAt,
    moderatedAt: _moderatedAt,
    moderatedBy: _moderatedBy,
    moderationReason: _moderationReason,
    ...ledger
  } = user;
  return ledger;
}

class MemoryGridRepository implements GridRepository {
  private members = new Map<string, GridUser>();
  private coupons = new Map<string, GridCouponRecord[]>();
  private txs     = new Map<string, CreditTransaction[]>();
  private orders  = new Map<string, OrderHistory[]>();
  private redemptions = new Map<string, RedemptionRecord>();
  private leaderboardSnapshots: LeaderboardSnapshot[] = [];
  private auditLogs: AuditLog[] = [];
  private adminActions: AdminAction[] = [];
  private syncJobs = new Map<string, SyncJob>();

  async getUser(memberId: string) {
    return this.members.get(memberId) ?? null;
  }

  async upsertUserFromLedger(
    ledger: GridMemberLedger,
    identity?: { roles?: GridUserRole[]; lastLoginAt?: string | null },
  ) {
    const user = asUser(ledger, this.members.get(ledger.memberId), identity);
    this.members.set(user.memberId, { ...user });
    return user;
  }

  async listUsers(opts?: {
    limit?: number;
    skip?: number;
    query?: string;
    status?: GridUserStatus;
    role?: GridUserRole;
    fraudHold?: boolean;
  }) {
    const q = opts?.query?.toLowerCase().trim();
    let users = [...this.members.values()];
    if (q) {
      users = users.filter((u) =>
        [u.username, u.email, u.memberId].some((v) => v.toLowerCase().includes(q)),
      );
    }
    if (opts?.status) users = users.filter((u) => u.status === opts.status);
    if (opts?.role) users = users.filter((u) => u.roles.includes(opts.role!));
    if (opts?.fraudHold !== undefined)
      users = users.filter((u) => !!u.fraudHold === opts.fraudHold);
    return users
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(opts?.skip ?? 0, (opts?.skip ?? 0) + (opts?.limit ?? 50));
  }

  async countUsers(opts?: { status?: GridUserStatus; fraudHold?: boolean }) {
    let users = [...this.members.values()];
    if (opts?.status) users = users.filter((u) => u.status === opts.status);
    if (opts?.fraudHold !== undefined)
      users = users.filter((u) => !!u.fraudHold === opts.fraudHold);
    return users.length;
  }

  async updateUserStatus(
    memberId: string,
    status: GridUserStatus,
    moderation: { actorMemberId: string; reason: string; now: string },
  ) {
    const user = this.members.get(memberId);
    if (!user) return null;
    const updated: GridUser = {
      ...user,
      status,
      moderatedAt: moderation.now,
      moderatedBy: moderation.actorMemberId,
      moderationReason: moderation.reason,
      updatedAt: moderation.now,
    };
    this.members.set(memberId, updated);
    return updated;
  }

  async grantUserRole(memberId: string, role: GridUserRole, now: string) {
    const user = this.members.get(memberId);
    if (!user) return null;
    const updated = {
      ...user,
      roles: Array.from(new Set([...user.roles, role])),
      updatedAt: now,
    };
    this.members.set(memberId, updated);
    return updated;
  }

  async setRankOverride(
    memberId: string,
    level: GridTierKey | null,
    reason: string,
    now: string,
  ) {
    const user = this.members.get(memberId);
    if (!user) return null;
    const updated: GridUser = {
      ...user,
      rankOverride: level,
      rankOverrideReason: level ? reason : null,
      rankOverrideAt: level ? now : null,
      level: level ?? user.level,
      updatedAt: now,
    };
    this.members.set(memberId, updated);
    return updated;
  }

  async setFraudAssessment(
    memberId: string,
    fraud: Pick<GridMemberLedger, "fraudHold" | "fraudScore" | "fraudSignals">,
    now: string,
  ) {
    const user = this.members.get(memberId);
    if (!user) return;
    this.members.set(memberId, { ...user, ...fraud, updatedAt: now });
  }

  async atomicCreditAdjustment(memberId: string, amount: number, now: string) {
    const user = this.members.get(memberId);
    if (!user) return null;
    if (amount < 0 && user.availableCreds < Math.abs(amount)) return null;
    const updated: GridUser = {
      ...user,
      adjustmentCreds: user.adjustmentCreds + amount,
      lifetimeCreds: Math.max(user.lifetimeCreds + amount, 0),
      availableCreds: user.availableCreds + amount,
      updatedAt: now,
    };
    this.members.set(memberId, updated);
    return asLedger(updated);
  }

  async getMemberLedger(m: string) {
    const user = this.members.get(m);
    return user ? asLedger(user) : null;
  }

  async upsertMemberLedger(l: GridMemberLedger) {
    this.members.set(l.memberId, asUser(l, this.members.get(l.memberId)));
    return l;
  }

  async atomicRedemption(memberId: string, creds: number, now: string) {
    const l = this.members.get(memberId);
    if (!l || l.availableCreds < creds) return null;
    const updated: GridUser = {
      ...l,
      redeemedCreds:  l.redeemedCreds + creds,
      availableCreds: l.availableCreds - creds,
      updatedAt:      now,
    };
    this.members.set(memberId, updated);
    return asLedger(updated);
  }

  async listTopMembers(limit: number): Promise<GridLeaderboardEntry[]> {
    return this.listLeaderboardEntries({ limit });
  }

  async listLeaderboardEntries(opts: {
    limit: number;
    skip?: number;
    includeSuspended?: boolean;
  }): Promise<GridLeaderboardEntry[]> {
    return [...this.members.values()]
      .filter((l) =>
        opts.includeSuspended ||
        (l.status === "ACTIVE" && !l.fraudHold),
      )
      .sort((a, b) => b.lifetimeCreds - a.lifetimeCreds)
      .slice(opts.skip ?? 0, (opts.skip ?? 0) + opts.limit)
      .map((l, idx) => ({
        rank:          (opts.skip ?? 0) + idx + 1,
        memberId:      l.memberId,
        username:      l.username,
        level:         l.rankOverride ?? l.level,
        lifetimeCreds: l.lifetimeCreds,
        availableCreds: l.availableCreds,
        orderCount:     l.orderCount,
        fraudHold:      l.fraudHold,
      }));
  }

  async getMemberRank(memberId: string) {
    const sorted = [...this.members.values()]
      .filter((u) => u.status === "ACTIVE" && !u.fraudHold)
      .sort((a, b) => b.lifetimeCreds - a.lifetimeCreds);
    const idx = sorted.findIndex((u) => u.memberId === memberId);
    return { rank: idx === -1 ? null : idx + 1, total: sorted.length };
  }

  async getGlobalStats(): Promise<GlobalStats> {
    const users = [...this.members.values()];
    const coupons = [...this.coupons.values()].flat();
    return {
      activeUsers: users.filter((u) => u.status === "ACTIVE").length,
      totalCredsIssued: users.reduce((s, u) => s + u.lifetimeCreds, 0),
      totalCredsRedeemed: users.reduce((s, u) => s + u.redeemedCreds, 0),
      totalAvailableCreds: users.reduce((s, u) => s + u.availableCreds, 0),
      totalPurchaseValue: users.reduce((s, u) => s + u.totalPurchaseValue, 0),
      totalCouponsIssued: coupons.filter((c) => c.status !== "FAILED").length,
      totalCouponsUsed: coupons.filter((c) => c.status === "USED").length,
      totalSavingsRupees: coupons
        .filter((c) => c.status === "USED")
        .reduce((s, c) => s + c.valueRupees, 0),
      suspendedUsers: users.filter((u) => u.status !== "ACTIVE").length,
      usersOnFraudHold: users.filter((u) => !!u.fraudHold).length,
    };
  }

  async getAllMemberIds() {
    return [...this.members.keys()];
  }

  async listCouponsByMember(memberId: string, limit = 20) {
    return (this.coupons.get(memberId) ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async listCouponsByStatus(memberId: string, status: GridCouponStatus) {
    return (this.coupons.get(memberId) ?? []).filter((c) => c.status === status);
  }

  async saveCoupon(coupon: GridCouponRecord) {
    const list = this.coupons.get(coupon.memberId) ?? [];
    if (!list.find((c) => c.code === coupon.code)) list.push({ ...coupon });
    this.coupons.set(coupon.memberId, list);
    return coupon;
  }

  async markCouponUsed(code: string, orderId: string, usedAt: string) {
    for (const [, list] of this.coupons) {
      const idx = list.findIndex(
        (c) => c.code === code && c.status !== "USED" && c.status !== "EXPIRED",
      );
      if (idx !== -1) {
        list[idx] = { ...list[idx], status: "USED", usedAt, orderId };
        return true;
      }
    }
    return false;
  }

  async expireStaleCoupons(memberId: string, now: string) {
    const list = this.coupons.get(memberId) ?? [];
    let count  = 0;
    const updated = list.map((c) => {
      if (c.status === "ACTIVE" && c.expiresAt && c.expiresAt < now) {
        count++;
        return { ...c, status: "EXPIRED" as GridCouponStatus };
      }
      return c;
    });
    this.coupons.set(memberId, updated);
    return count;
  }

  async getCouponSummary(memberId: string) {
    const list = this.coupons.get(memberId) ?? [];
    return {
      total:   list.length,
      active:  list.filter((c) => c.status === "ACTIVE").length,
      used:    list.filter((c) => c.status === "USED").length,
      expired: list.filter((c) => c.status === "EXPIRED").length,
      failed:  list.filter((c) => c.status === "FAILED").length,
      totalSavingsRupees: list
        .filter((c) => c.status === "USED")
        .reduce((s, c) => s + c.valueRupees, 0),
    };
  }

  async saveCreditTransaction(tx: CreditTransaction) {
    const list = this.txs.get(tx.memberId) ?? [];
    const dup  = list.find(
      (t) => t.referenceId === tx.referenceId && t.type === tx.type,
    );
    if (!dup) {
      list.push({ ...tx });
      this.txs.set(tx.memberId, list);
    }
  }

  async listCreditTransactions(
    memberId: string,
    opts?:    { limit?: number; skip?: number; since?: Date },
  ) {
    let list = (this.txs.get(memberId) ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (opts?.since)
      list = list.filter((t) => new Date(t.createdAt) >= opts.since!);
    return list.slice(
      opts?.skip ?? 0,
      (opts?.skip ?? 0) + (opts?.limit ?? 20),
    );
  }

  async hasRedeemTransaction(memberId: string, referenceId: string) {
    return !!(this.txs.get(memberId) ?? []).find(
      (t) => t.referenceId === referenceId && t.type === "REDEEM",
    );
  }

  async getTransactionSummary(memberId: string, since: Date) {
    const list = (this.txs.get(memberId) ?? []).filter(
      (t) => new Date(t.createdAt) >= since,
    );
    return {
      earned:   list
        .filter((t) => t.type === "EARN" || t.type === "BONUS")
        .reduce((s, t) => s + t.amount, 0),
      redeemed: list
        .filter((t) => t.type === "REDEEM")
        .reduce((s, t) => s + t.amount, 0),
      txCount: list.length,
    };
  }

  async saveOrderHistory(order: OrderHistory) {
    const list = this.orders.get(order.memberId) ?? [];
    if (!list.find((o) => o.orderId === order.orderId)) {
      list.push({ ...order });
      this.orders.set(order.memberId, list);
    }
  }

  async getProcessedOrderIds(memberId: string) {
    return new Set(
      (this.orders.get(memberId) ?? []).map((o) => o.orderId),
    );
  }

  async getRedemptionByIdempotencyKey(memberId: string, idempotencyKey: string) {
    return [...this.redemptions.values()].find(
      (r) => r.memberId === memberId && r.idempotencyKey === idempotencyKey,
    ) ?? null;
  }

  async saveRedemption(redemption: RedemptionRecord) {
    this.redemptions.set(redemption.id, { ...redemption });
    return redemption;
  }

  async updateRedemption(
    id: string,
    patch: Partial<Omit<RedemptionRecord, "id" | "createdAt">>,
  ) {
    const existing = this.redemptions.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.redemptions.set(id, updated);
    return updated;
  }

  async listRedemptions(opts?: {
    memberId?: string;
    status?: RedemptionRecord["status"];
    limit?: number;
    skip?: number;
  }) {
    let rows = [...this.redemptions.values()];
    if (opts?.memberId) rows = rows.filter((r) => r.memberId === opts.memberId);
    if (opts?.status) rows = rows.filter((r) => r.status === opts.status);
    return rows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(opts?.skip ?? 0, (opts?.skip ?? 0) + (opts?.limit ?? 50));
  }

  async getLatestLeaderboardSnapshot() {
    return this.leaderboardSnapshots
      .slice()
      .sort((a, b) => b.builtAt.localeCompare(a.builtAt))[0] ?? null;
  }

  async saveLeaderboardSnapshot(snapshot: LeaderboardSnapshot) {
    this.leaderboardSnapshots.push({ ...snapshot });
    return snapshot;
  }

  async saveAuditLog(log: AuditLog) {
    this.auditLogs.push({ ...log });
  }

  async listAuditLogs(opts?: { limit?: number; skip?: number; memberId?: string }) {
    let rows = this.auditLogs.slice();
    if (opts?.memberId) rows = rows.filter((l) => l.memberId === opts.memberId);
    return rows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(opts?.skip ?? 0, (opts?.skip ?? 0) + (opts?.limit ?? 100));
  }

  async saveAdminAction(action: AdminAction) {
    const existing = await this.getAdminActionByIdempotencyKey(
      action.actorMemberId,
      action.idempotencyKey,
    );
    if (existing) return existing;
    this.adminActions.push({ ...action });
    return action;
  }

  async getAdminActionByIdempotencyKey(actorMemberId: string, idempotencyKey: string) {
    return this.adminActions.find(
      (a) => a.actorMemberId === actorMemberId && a.idempotencyKey === idempotencyKey,
    ) ?? null;
  }

  async listAdminActions(opts?: { limit?: number; skip?: number; targetMemberId?: string }) {
    let rows = this.adminActions.slice();
    if (opts?.targetMemberId)
      rows = rows.filter((a) => a.targetMemberId === opts.targetMemberId);
    return rows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(opts?.skip ?? 0, (opts?.skip ?? 0) + (opts?.limit ?? 100));
  }

  async saveSyncJob(job: SyncJob) {
    this.syncJobs.set(job.id, { ...job });
    return job;
  }

  async updateSyncJob(id: string, patch: Partial<Omit<SyncJob, "id" | "startedAt">>) {
    const existing = this.syncJobs.get(id);
    if (existing) this.syncJobs.set(id, { ...existing, ...patch });
  }

  async listSyncJobs(opts?: { limit?: number; skip?: number; type?: SyncJob["type"] }) {
    let rows = [...this.syncJobs.values()];
    if (opts?.type) rows = rows.filter((j) => j.type === opts.type);
    return rows
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(opts?.skip ?? 0, (opts?.skip ?? 0) + (opts?.limit ?? 50));
  }
}

// ─── MongoDB implementation ───────────────────────────────────────────────────

class MongoGridRepository implements GridRepository {
  private async db(): Promise<Db> {
    const { MONGODB_URI, MONGODB_DB_NAME } = getEnv();
    if (!global.__GRID_MONGO_CLIENT__) {
      global.__GRID_MONGO_CLIENT__ = new MongoClient(MONGODB_URI!, {
        serverSelectionTimeoutMS: 10_000,
        connectTimeoutMS:         10_000,
        socketTimeoutMS:          30_000,
      }).connect();
    }
    const db = (await global.__GRID_MONGO_CLIENT__).db(MONGODB_DB_NAME);
    await ensureIndexes(db);
    return db;
  }

  async getUser(memberId: string) {
    const db = await this.db();
    const doc = await db
      .collection<GridUser>(COL_USERS)
      .findOne({ memberId }, { projection: { _id: 0 } });
    return doc ? asUser(doc, doc) : null;
  }

  async upsertUserFromLedger(
    ledger: GridMemberLedger,
    identity?: { roles?: GridUserRole[]; lastLoginAt?: string | null },
  ) {
    const db = await this.db();
    const existing = await this.getUser(ledger.memberId);
    const user = asUser(ledger, existing, identity);
    await db.collection<GridUser>(COL_USERS).updateOne(
      { memberId: ledger.memberId },
      {
        $set: {
          ...user,
          roles: user.roles,
          status: user.status,
          lastLoginAt: user.lastLoginAt,
        },
        $setOnInsert: { createdAt: user.createdAt },
      },
      { upsert: true },
    );
    return user;
  }

  async listUsers(opts?: {
    limit?: number;
    skip?: number;
    query?: string;
    status?: GridUserStatus;
    role?: GridUserRole;
    fraudHold?: boolean;
  }) {
    const db = await this.db();
    const filter: Record<string, unknown> = {};
    if (opts?.status) filter.status = opts.status;
    if (opts?.role) filter.roles = opts.role;
    if (opts?.fraudHold !== undefined) filter.fraudHold = opts.fraudHold;
    if (opts?.query?.trim()) {
      const rx = new RegExp(opts.query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ username: rx }, { email: rx }, { memberId: rx }];
    }
    const docs = await db
      .collection<GridUser>(COL_USERS)
      .find(filter, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 50)
      .toArray();
    return docs.map((d) => asUser(d, d));
  }

  async countUsers(opts?: { status?: GridUserStatus; fraudHold?: boolean }) {
    const db = await this.db();
    const filter: Record<string, unknown> = {};
    if (opts?.status) filter.status = opts.status;
    if (opts?.fraudHold !== undefined) filter.fraudHold = opts.fraudHold;
    return db.collection<GridUser>(COL_USERS).countDocuments(filter);
  }

  async updateUserStatus(
    memberId: string,
    status: GridUserStatus,
    moderation: { actorMemberId: string; reason: string; now: string },
  ) {
    const db = await this.db();
    const result = await db.collection<GridUser>(COL_USERS).findOneAndUpdate(
      { memberId },
      {
        $set: {
          status,
          moderatedAt: moderation.now,
          moderatedBy: moderation.actorMemberId,
          moderationReason: moderation.reason,
          updatedAt: moderation.now,
        },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? asUser(result, result) : null;
  }

  async grantUserRole(memberId: string, role: GridUserRole, now: string) {
    const db = await this.db();
    const result = await db.collection<GridUser>(COL_USERS).findOneAndUpdate(
      { memberId },
      { $addToSet: { roles: role }, $set: { updatedAt: now } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? asUser(result, result) : null;
  }

  async setRankOverride(
    memberId: string,
    level: GridTierKey | null,
    reason: string,
    now: string,
  ) {
    const db = await this.db();
    const result = await db.collection<GridUser>(COL_USERS).findOneAndUpdate(
      { memberId },
      {
        $set: {
          rankOverride: level,
          rankOverrideReason: level ? reason : null,
          rankOverrideAt: level ? now : null,
          ...(level ? { level } : {}),
          updatedAt: now,
        },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? asUser(result, result) : null;
  }

  async setFraudAssessment(
    memberId: string,
    fraud: Pick<GridMemberLedger, "fraudHold" | "fraudScore" | "fraudSignals">,
    now: string,
  ) {
    const db = await this.db();
    await db.collection<GridUser>(COL_USERS).updateOne(
      { memberId },
      { $set: { ...fraud, updatedAt: now } },
    );
  }

  async atomicCreditAdjustment(memberId: string, amount: number, now: string) {
    const db = await this.db();
    const current = await this.getUser(memberId);
    if (!current) return null;
    if (amount < 0 && current.availableCreds < Math.abs(amount)) return null;

    const result = await db.collection<GridUser>(COL_USERS).findOneAndUpdate(
      {
        memberId,
        ...(amount < 0 ? { availableCreds: { $gte: Math.abs(amount) } } : {}),
      },
      {
        $inc: {
          adjustmentCreds: amount,
          lifetimeCreds: amount,
          availableCreds: amount,
        },
        $set: { updatedAt: now },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result ? asLedger(asUser(result, result)) : null;
  }

  async getMemberLedger(memberId: string) {
    const db  = await this.db();
    const doc = await db
      .collection<GridUser>(COL_USERS)
      .findOne({ memberId }, { projection: { _id: 0 } });
    return doc ? asLedger(asUser(doc, doc)) : null;
  }

  async upsertMemberLedger(ledger: GridMemberLedger) {
    await this.upsertUserFromLedger(ledger);
    return ledger;
  }

  async atomicRedemption(memberId: string, creds: number, now: string) {
    const db     = await this.db();
    const result = await db
      .collection<GridUser>(COL_USERS)
      .findOneAndUpdate(
        { memberId, status: "ACTIVE", fraudHold: { $ne: true }, availableCreds: { $gte: creds } },
        {
          $inc: { redeemedCreds: creds, availableCreds: -creds },
          $set: { updatedAt: now },
        },
        { returnDocument: "after", projection: { _id: 0 } },
      );
    return result ? asLedger(asUser(result, result)) : null;
  }

  async listTopMembers(limit: number): Promise<GridLeaderboardEntry[]> {
    return this.listLeaderboardEntries({ limit });
  }

  async listLeaderboardEntries(opts: {
    limit: number;
    skip?: number;
    includeSuspended?: boolean;
  }): Promise<GridLeaderboardEntry[]> {
    const db   = await this.db();
    const filter: Filter<GridUser> = opts.includeSuspended
      ? {}
      : { status: "ACTIVE", fraudHold: { $ne: true } };
    const docs = await db
      .collection<GridUser>(COL_USERS)
      .find(filter, { projection: { _id: 0 } })
      .sort({ lifetimeCreds: -1 })
      .skip(opts.skip ?? 0)
      .limit(opts.limit)
      .toArray();
    return docs.map((l, idx) => ({
      rank:          (opts.skip ?? 0) + idx + 1,
      memberId:      l.memberId,
      username:      l.username,
      level:         l.rankOverride ?? l.level,
      lifetimeCreds: l.lifetimeCreds,
      availableCreds: l.availableCreds,
      orderCount:     l.orderCount,
      fraudHold:      l.fraudHold,
    }));
  }

  async getMemberRank(memberId: string) {
    const db = await this.db();
    const user = await this.getUser(memberId);
    const base: Filter<GridUser> = { status: "ACTIVE", fraudHold: { $ne: true } };
    const total = await db.collection<GridUser>(COL_USERS).countDocuments(base);
    if (!user || user.status !== "ACTIVE" || user.fraudHold) {
      return { rank: null, total };
    }
    const ahead = await db.collection<GridUser>(COL_USERS).countDocuments({
      ...base,
      $or: [
        { lifetimeCreds: { $gt: user.lifetimeCreds } },
        {
          lifetimeCreds: user.lifetimeCreds,
          updatedAt: { $lt: user.updatedAt },
        },
      ],
    });
    return { rank: ahead + 1, total };
  }

  async getGlobalStats(): Promise<GlobalStats> {
    const db = await this.db();
    const [userAgg, couponAgg] = await Promise.all([
      db.collection<GridUser>(COL_USERS).aggregate([
        {
          $group: {
            _id: null,
            activeUsers: {
              $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] },
            },
            suspendedUsers: {
              $sum: { $cond: [{ $ne: ["$status", "ACTIVE"] }, 1, 0] },
            },
            usersOnFraudHold: {
              $sum: { $cond: [{ $eq: ["$fraudHold", true] }, 1, 0] },
            },
            totalCredsIssued: { $sum: "$lifetimeCreds" },
            totalCredsRedeemed: { $sum: "$redeemedCreds" },
            totalAvailableCreds: { $sum: "$availableCreds" },
            totalPurchaseValue: { $sum: "$totalPurchaseValue" },
          },
        },
      ]).toArray(),
      db.collection<GridCouponRecord>(COL_COUPONS).aggregate([
        {
          $group: {
            _id: null,
            totalCouponsIssued: {
              $sum: { $cond: [{ $ne: ["$status", "FAILED"] }, 1, 0] },
            },
            totalCouponsUsed: {
              $sum: { $cond: [{ $eq: ["$status", "USED"] }, 1, 0] },
            },
            totalSavingsRupees: {
              $sum: { $cond: [{ $eq: ["$status", "USED"] }, "$valueRupees", 0] },
            },
          },
        },
      ]).toArray(),
    ]);
    const u = userAgg[0] as Partial<GlobalStats> | undefined;
    const c = couponAgg[0] as Partial<GlobalStats> | undefined;
    return {
      activeUsers: u?.activeUsers ?? 0,
      totalCredsIssued: u?.totalCredsIssued ?? 0,
      totalCredsRedeemed: u?.totalCredsRedeemed ?? 0,
      totalAvailableCreds: u?.totalAvailableCreds ?? 0,
      totalPurchaseValue: u?.totalPurchaseValue ?? 0,
      totalCouponsIssued: c?.totalCouponsIssued ?? 0,
      totalCouponsUsed: c?.totalCouponsUsed ?? 0,
      totalSavingsRupees: c?.totalSavingsRupees ?? 0,
      suspendedUsers: u?.suspendedUsers ?? 0,
      usersOnFraudHold: u?.usersOnFraudHold ?? 0,
    };
  }

  async getAllMemberIds() {
    const db   = await this.db();
    const docs = await db
      .collection<GridMemberLedger>(COL_USERS)
      .find({}, { projection: { _id: 0, memberId: 1 } })
      .toArray();
    return docs.map((d) => d.memberId);
  }

  async listCouponsByMember(memberId: string, limit = 20) {
    const db = await this.db();
    return db
      .collection<GridCouponRecord>(COL_COUPONS)
      .find({ memberId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray() as unknown as GridCouponRecord[];
  }

  async listCouponsByStatus(memberId: string, status: GridCouponStatus) {
    const db = await this.db();
    return db
      .collection<GridCouponRecord>(COL_COUPONS)
      .find({ memberId, status }, { projection: { _id: 0 } })
      .toArray() as unknown as GridCouponRecord[];
  }

  async saveCoupon(coupon: GridCouponRecord) {
    const db = await this.db();
    try {
      await db
        .collection<GridCouponRecord>(COL_COUPONS)
        .insertOne({ ...coupon } as never);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        console.warn("[GRID_REPO] Duplicate coupon code ignored:", coupon.code);
      } else { throw e; }
    }
    return coupon;
  }

  async markCouponUsed(code: string, orderId: string, usedAt: string) {
    const db     = await this.db();
    const result = await db
      .collection<GridCouponRecord>(COL_COUPONS)
      .updateOne(
        { code, status: { $nin: ["USED", "EXPIRED"] } },
        { $set: { status: "USED", usedAt, orderId } },
      );
    return result.modifiedCount > 0;
  }

  async expireStaleCoupons(memberId: string, now: string) {
    const db     = await this.db();
    const result = await db
      .collection<GridCouponRecord>(COL_COUPONS)
      .updateMany(
        { memberId, status: "ACTIVE", expiresAt: { $lt: now } },
        { $set: { status: "EXPIRED" } },
      );
    return result.modifiedCount;
  }

  async getCouponSummary(memberId: string) {
    const db  = await this.db();
    const agg = await db
      .collection<GridCouponRecord>(COL_COUPONS)
      .aggregate([
        { $match: { memberId } },
        {
          $group: {
            _id:             "$status",
            count:           { $sum: 1 },
            totalValueRupees: { $sum: "$valueRupees" },
          },
        },
      ])
      .toArray() as Array<{ _id: string; count: number; totalValueRupees: number }>;

    const by = Object.fromEntries(agg.map((r) => [r._id, r]));
    return {
      total:   agg.reduce((s, r) => s + r.count, 0),
      active:  by["ACTIVE"]?.count   ?? 0,
      used:    by["USED"]?.count     ?? 0,
      expired: by["EXPIRED"]?.count  ?? 0,
      failed:  by["FAILED"]?.count   ?? 0,
      totalSavingsRupees: by["USED"]?.totalValueRupees ?? 0,
    };
  }

  async saveCreditTransaction(tx: CreditTransaction) {
    const db = await this.db();
    try {
      await db
        .collection<CreditTransaction>(COL_LEDGER)
        .insertOne({ ...tx } as never);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        console.warn("[GRID_REPO] Duplicate tx ignored:", tx.referenceId, tx.type);
      } else { throw e; }
    }
  }

  async listCreditTransactions(
    memberId: string,
    opts?:    { limit?: number; skip?: number; since?: Date },
  ) {
    const db    = await this.db();
    const query: Record<string, unknown> = { memberId };
    if (opts?.since) query.createdAt = { $gte: opts.since.toISOString() };
    return db
      .collection<CreditTransaction>(COL_LEDGER)
      .find(query, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 20)
      .toArray() as unknown as CreditTransaction[];
  }

  async hasRedeemTransaction(memberId: string, referenceId: string) {
    const db  = await this.db();
    const doc = await db
      .collection<CreditTransaction>(COL_LEDGER)
      .findOne(
        { memberId, referenceId, type: "REDEEM" },
        { projection: { _id: 0 } },
      );
    return !!doc;
  }

  async getTransactionSummary(memberId: string, since: Date) {
    const db  = await this.db();
    const agg = await db
      .collection<CreditTransaction>(COL_LEDGER)
      .aggregate([
        { $match: { memberId, createdAt: { $gte: since.toISOString() } } },
        {
          $group: {
            _id:      null,
            earned:   {
              $sum: {
                $cond: [{ $in: ["$type", ["EARN", "BONUS"]] }, "$amount", 0],
              },
            },
            redeemed: {
              $sum: { $cond: [{ $eq: ["$type", "REDEEM"] }, "$amount", 0] },
            },
            txCount:  { $sum: 1 },
          },
        },
      ])
      .toArray();
    const r = agg[0] as
      | { earned?: number; redeemed?: number; txCount?: number }
      | undefined;
    return {
      earned:  r?.earned   ?? 0,
      redeemed: r?.redeemed ?? 0,
      txCount: r?.txCount  ?? 0,
    };
  }

  async saveOrderHistory(order: OrderHistory) {
    const db = await this.db();
    try {
      await db
        .collection<OrderHistory>(COL_ORDERS)
        .insertOne({ ...order } as never);
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      // Duplicate orderId is idempotent — skip silently.
    }
  }

  async getProcessedOrderIds(memberId: string) {
    const db   = await this.db();
    const docs = await db
      .collection<OrderHistory>(COL_ORDERS)
      .find({ memberId }, { projection: { _id: 0, orderId: 1 } })
      .toArray();
    return new Set(docs.map((d) => d.orderId));
  }

  async getRedemptionByIdempotencyKey(memberId: string, idempotencyKey: string) {
    const db = await this.db();
    return db.collection<RedemptionRecord>(COL_REDEMPTIONS).findOne(
      { memberId, idempotencyKey },
      { projection: { _id: 0 } },
    );
  }

  async saveRedemption(redemption: RedemptionRecord) {
    const db = await this.db();
    try {
      await db.collection<RedemptionRecord>(COL_REDEMPTIONS).insertOne(
        { ...redemption } as never,
      );
      return redemption;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      const existing = await this.getRedemptionByIdempotencyKey(
        redemption.memberId,
        redemption.idempotencyKey,
      );
      return existing ?? redemption;
    }
  }

  async updateRedemption(
    id: string,
    patch: Partial<Omit<RedemptionRecord, "id" | "createdAt">>,
  ) {
    const db = await this.db();
    const result = await db.collection<RedemptionRecord>(COL_REDEMPTIONS)
      .findOneAndUpdate(
        { id },
        { $set: patch },
        { returnDocument: "after", projection: { _id: 0 } },
      );
    return result ?? null;
  }

  async listRedemptions(opts?: {
    memberId?: string;
    status?: RedemptionRecord["status"];
    limit?: number;
    skip?: number;
  }) {
    const db = await this.db();
    const filter: Record<string, unknown> = {};
    if (opts?.memberId) filter.memberId = opts.memberId;
    if (opts?.status) filter.status = opts.status;
    return db.collection<RedemptionRecord>(COL_REDEMPTIONS)
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 50)
      .toArray();
  }

  async getLatestLeaderboardSnapshot() {
    const db = await this.db();
    return db.collection<LeaderboardSnapshot>(COL_LEADERBOARD_SNAPSHOTS)
      .findOne({}, { sort: { builtAt: -1 }, projection: { _id: 0 } });
  }

  async saveLeaderboardSnapshot(snapshot: LeaderboardSnapshot) {
    const db = await this.db();
    await db.collection<LeaderboardSnapshot>(COL_LEADERBOARD_SNAPSHOTS)
      .insertOne({ ...snapshot } as never);
    return snapshot;
  }

  async saveAuditLog(log: AuditLog) {
    const db = await this.db();
    await db.collection<AuditLog>(COL_AUDIT_LOGS).insertOne({ ...log } as never);
  }

  async listAuditLogs(opts?: { limit?: number; skip?: number; memberId?: string }) {
    const db = await this.db();
    const filter: Record<string, unknown> = {};
    if (opts?.memberId) filter.memberId = opts.memberId;
    return db.collection<AuditLog>(COL_AUDIT_LOGS)
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 100)
      .toArray();
  }

  async saveAdminAction(action: AdminAction) {
    const db = await this.db();
    try {
      await db.collection<AdminAction>(COL_ADMIN_ACTIONS).insertOne(
        { ...action } as never,
      );
      return action;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      const existing = await this.getAdminActionByIdempotencyKey(
        action.actorMemberId,
        action.idempotencyKey,
      );
      return existing ?? action;
    }
  }

  async getAdminActionByIdempotencyKey(
    actorMemberId: string,
    idempotencyKey: string,
  ) {
    const db = await this.db();
    return db.collection<AdminAction>(COL_ADMIN_ACTIONS).findOne(
      { actorMemberId, idempotencyKey },
      { projection: { _id: 0 } },
    );
  }

  async listAdminActions(opts?: { limit?: number; skip?: number; targetMemberId?: string }) {
    const db = await this.db();
    const filter: Record<string, unknown> = {};
    if (opts?.targetMemberId) filter.targetMemberId = opts.targetMemberId;
    return db.collection<AdminAction>(COL_ADMIN_ACTIONS)
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 100)
      .toArray();
  }

  async saveSyncJob(job: SyncJob) {
    const db = await this.db();
    await db.collection<SyncJob>(COL_SYNC_JOBS).insertOne({ ...job } as never);
    return job;
  }

  async updateSyncJob(id: string, patch: Partial<Omit<SyncJob, "id" | "startedAt">>) {
    const db = await this.db();
    await db.collection<SyncJob>(COL_SYNC_JOBS).updateOne({ id }, { $set: patch });
  }

  async listSyncJobs(opts?: { limit?: number; skip?: number; type?: SyncJob["type"] }) {
    const db = await this.db();
    const filter: Record<string, unknown> = {};
    if (opts?.type) filter.type = opts.type;
    return db.collection<SyncJob>(COL_SYNC_JOBS)
      .find(filter, { projection: { _id: 0 } })
      .sort({ startedAt: -1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 50)
      .toArray();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function getRepository(): GridRepository {
  const { MONGODB_URI } = getEnv();
  if (!MONGODB_URI) {
    if (!global.__GRID_MEM_REPO__)
      global.__GRID_MEM_REPO__ = new MemoryGridRepository();
    return global.__GRID_MEM_REPO__;
  }
  if (!global.__GRID_MONGO_REPO__)
    global.__GRID_MONGO_REPO__ = new MongoGridRepository();
  return global.__GRID_MONGO_REPO__;
}
