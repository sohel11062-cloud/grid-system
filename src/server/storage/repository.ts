import "server-only";

import { MongoClient, type Db } from "mongodb";
import type {
  CreditTransaction,
  GridCouponRecord,
  GridCouponStatus,
  GridLeaderboardEntry,
  GridMemberLedger,
  OrderHistory,
} from "@/lib/grid";
import { getEnv } from "@/server/env";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface GridRepository {
  // ── Ledger ────────────────────────────────────────────────────────────────
  getMemberLedger(memberId: string): Promise<GridMemberLedger | null>;
  upsertMemberLedger(ledger: GridMemberLedger): Promise<GridMemberLedger>;
  atomicRedemption(memberId: string, creds: number, now: string): Promise<GridMemberLedger | null>;
  listTopMembers(limit: number): Promise<GridLeaderboardEntry[]>;

  // ── Coupons ───────────────────────────────────────────────────────────────
  listCouponsByMember(memberId: string, limit?: number): Promise<GridCouponRecord[]>;
  listCouponsByStatus(memberId: string, status: GridCouponStatus): Promise<GridCouponRecord[]>;
  saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord>;
  /**
   * Atomically mark a coupon as USED.
   * Only succeeds if current status is NOT already "USED" or "EXPIRED".
   * Returns true if the update was applied.
   */
  markCouponUsed(code: string, orderId: string, usedAt: string): Promise<boolean>;
  /**
   * Mark all ACTIVE coupons whose expiresAt < now as EXPIRED.
   * Returns count of expired coupons.
   */
  expireStaleCoupons(memberId: string, now: string): Promise<number>;

  // ── Credit transactions ───────────────────────────────────────────────────
  saveCreditTransaction(tx: CreditTransaction): Promise<void>;
  /**
   * Returns paginated credit transactions for a member, newest first.
   */
  listCreditTransactions(
    memberId: string,
    opts?: { limit?: number; skip?: number; since?: Date }
  ): Promise<CreditTransaction[]>;
  /**
   * Returns true if a REDEEM transaction already exists for this referenceId.
   * Prevents duplicate deductions on retry.
   */
  hasRedeemTransaction(memberId: string, referenceId: string): Promise<boolean>;

  // ── Order history ─────────────────────────────────────────────────────────
  saveOrderHistory(order: OrderHistory): Promise<void>;
  /**
   * Returns the set of order IDs already recorded in order_history for this member.
   * Used for O(1) duplicate detection during sync.
   */
  getProcessedOrderIds(memberId: string): Promise<Set<string>>;

  // ── Analytics (used by reports) ───────────────────────────────────────────
  getAllMemberIds(): Promise<string[]>;
  getTransactionSummary(
    memberId: string,
    since: Date
  ): Promise<{ earned: number; redeemed: number; txCount: number }>;
  getCouponSummary(memberId: string): Promise<{
    total:   number;
    active:  number;
    used:    number;
    expired: number;
    failed:  number;
    totalSavingsRupees: number;
  }>;
}

// ─── Collection names ─────────────────────────────────────────────────────────

const COL_MEMBERS  = "grid_members";
const COL_COUPONS  = "grid_coupons";
const COL_TX       = "credit_transactions";
const COL_ORDERS   = "order_history";

// ─── Global singletons ────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __GRID_MONGO_CLIENT__: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __GRID_INDEXES_ENSURED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __GRID_MEM_REPO__: MemoryGridRepository | undefined;
  // eslint-disable-next-line no-var
  var __GRID_MONGO_REPO__: MongoGridRepository | undefined;
}

// ─── Index setup ──────────────────────────────────────────────────────────────

async function ensureIndexes(db: Db): Promise<void> {
  if (global.__GRID_INDEXES_ENSURED__) return;

  await Promise.all([
    // Members
    db.collection(COL_MEMBERS).createIndex({ memberId: 1 }, { unique: true }),

    // Coupons — unique code, queryable by member + status
    db.collection(COL_COUPONS).createIndex({ code: 1 },                         { unique: true }),
    db.collection(COL_COUPONS).createIndex({ memberId: 1, status: 1 }),
    db.collection(COL_COUPONS).createIndex({ memberId: 1, createdAt: -1 }),
    db.collection(COL_COUPONS).createIndex({ expiresAt: 1 }),

    // Credit transactions — prevent duplicate entries for same (member, referenceId, type)
    db.collection(COL_TX).createIndex(
      { memberId: 1, referenceId: 1, type: 1 },
      { unique: true }
    ),
    db.collection(COL_TX).createIndex({ memberId: 1, createdAt: -1 }),
    db.collection(COL_TX).createIndex({ createdAt: -1 }),  // for weekly report scans

    // Order history — unique per order, fast lookup by member
    db.collection(COL_ORDERS).createIndex({ orderId: 1 },      { unique: true }),
    db.collection(COL_ORDERS).createIndex({ memberId: 1 }),
    db.collection(COL_ORDERS).createIndex({ memberId: 1, createdAt: -1 }),
  ]);

  global.__GRID_INDEXES_ENSURED__ = true;
}

// ─── In-memory implementation ─────────────────────────────────────────────────

class MemoryGridRepository implements GridRepository {
  private members  = new Map<string, GridMemberLedger>();
  private coupons  = new Map<string, GridCouponRecord[]>();
  private txs      = new Map<string, CreditTransaction[]>();
  private orders   = new Map<string, OrderHistory[]>();

  // ── Ledger ────────────────────────────────────────────────────────────────

  async getMemberLedger(memberId: string) {
    return this.members.get(memberId) ?? null;
  }

  async upsertMemberLedger(ledger: GridMemberLedger) {
    this.members.set(ledger.memberId, { ...ledger });
    return ledger;
  }

  async atomicRedemption(memberId: string, creds: number, now: string) {
    // Node.js single-thread: no await between read and write = atomic
    const ledger = this.members.get(memberId);
    if (!ledger || ledger.availableCreds < creds) return null;
    const updated: GridMemberLedger = {
      ...ledger,
      redeemedCreds:  ledger.redeemedCreds + creds,
      availableCreds: ledger.availableCreds - creds,
      updatedAt:      now,
    };
    this.members.set(memberId, updated);
    return updated;
  }

  async listTopMembers(limit: number): Promise<GridLeaderboardEntry[]> {
    return [...this.members.values()]
      .sort((a, b) => b.lifetimeCreds - a.lifetimeCreds)
      .slice(0, limit)
      .map((l) => ({ memberId: l.memberId, username: l.username, level: l.level, lifetimeCreds: l.lifetimeCreds }));
  }

  // ── Coupons ───────────────────────────────────────────────────────────────

  async listCouponsByMember(memberId: string, limit = 8) {
    return (this.coupons.get(memberId) ?? [])
      .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async listCouponsByStatus(memberId: string, status: GridCouponStatus) {
    return (this.coupons.get(memberId) ?? []).filter((c) => c.status === status);
  }

  async saveCoupon(coupon: GridCouponRecord) {
    const list = this.coupons.get(coupon.memberId) ?? [];
    // Prevent duplicate codes
    if (!list.find((c) => c.code === coupon.code)) list.push({ ...coupon });
    this.coupons.set(coupon.memberId, list);
    return coupon;
  }

  async markCouponUsed(code: string, orderId: string, usedAt: string) {
    for (const [, list] of this.coupons.entries()) {
      const idx = list.findIndex((c) => c.code === code && c.status !== "USED" && c.status !== "EXPIRED");
      if (idx !== -1) {
        list[idx] = { ...list[idx], status: "USED", usedAt, orderId };
        return true;
      }
    }
    return false;
  }

  async expireStaleCoupons(memberId: string, now: string) {
    const list = this.coupons.get(memberId) ?? [];
    let count = 0;
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

  // ── Credit transactions ───────────────────────────────────────────────────

  async saveCreditTransaction(tx: CreditTransaction) {
    // Dedup by (memberId, referenceId, type)
    const list = this.txs.get(tx.memberId) ?? [];
    const dup  = list.find((t) => t.referenceId === tx.referenceId && t.type === tx.type);
    if (!dup) { list.push({ ...tx }); this.txs.set(tx.memberId, list); }
  }

  async listCreditTransactions(memberId: string, opts?: { limit?: number; skip?: number; since?: Date }) {
    let list = (this.txs.get(memberId) ?? [])
      .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (opts?.since) list = list.filter((t) => new Date(t.createdAt) >= opts.since!);
    const skip  = opts?.skip  ?? 0;
    const limit = opts?.limit ?? 20;
    return list.slice(skip, skip + limit);
  }

  async hasRedeemTransaction(memberId: string, referenceId: string) {
    return !!(this.txs.get(memberId) ?? []).find(
      (t) => t.referenceId === referenceId && t.type === "REDEEM"
    );
  }

  // ── Order history ─────────────────────────────────────────────────────────

  async saveOrderHistory(order: OrderHistory) {
    const list = this.orders.get(order.memberId) ?? [];
    if (!list.find((o) => o.orderId === order.orderId)) {
      list.push({ ...order });
      this.orders.set(order.memberId, list);
    }
  }

  async getProcessedOrderIds(memberId: string) {
    return new Set((this.orders.get(memberId) ?? []).map((o) => o.orderId));
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getAllMemberIds() {
    return [...this.members.keys()];
  }

  async getTransactionSummary(memberId: string, since: Date) {
    const list = (this.txs.get(memberId) ?? []).filter(
      (t) => new Date(t.createdAt) >= since
    );
    return {
      earned:   list.filter((t) => t.type === "EARN" || t.type === "BONUS").reduce((s, t) => s + t.amount, 0),
      redeemed: list.filter((t) => t.type === "REDEEM").reduce((s, t) => s + t.amount, 0),
      txCount:  list.length,
    };
  }

  async getCouponSummary(memberId: string) {
    const list = this.coupons.get(memberId) ?? [];
    return {
      total:              list.length,
      active:             list.filter((c) => c.status === "ACTIVE").length,
      used:               list.filter((c) => c.status === "USED").length,
      expired:            list.filter((c) => c.status === "EXPIRED").length,
      failed:             list.filter((c) => c.status === "FAILED").length,
      totalSavingsRupees: list.filter((c) => c.status === "USED").reduce((s, c) => s + c.valueRupees, 0),
    };
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
    await ensureIndexes(db); // no-op after first call
    return db;
  }

  // ── Ledger ────────────────────────────────────────────────────────────────

  async getMemberLedger(memberId: string) {
    const db  = await this.db();
    const doc = await db.collection<GridMemberLedger>(COL_MEMBERS)
      .findOne({ memberId }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async upsertMemberLedger(ledger: GridMemberLedger) {
    const db = await this.db();
    await db.collection<GridMemberLedger>(COL_MEMBERS).updateOne(
      { memberId: ledger.memberId },
      { $set: { ...ledger }, $setOnInsert: { createdAt: ledger.createdAt } },
      { upsert: true }
    );
    return ledger;
  }

  async atomicRedemption(memberId: string, creds: number, now: string) {
    const db = await this.db();
    const result = await db.collection<GridMemberLedger>(COL_MEMBERS).findOneAndUpdate(
      { memberId, availableCreds: { $gte: creds } },
      {
        $inc: { redeemedCreds: creds, availableCreds: -creds },
        $set: { updatedAt: now },
      },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    return result ?? null;
  }

  async listTopMembers(limit: number): Promise<GridLeaderboardEntry[]> {
    const db   = await this.db();
    const docs = await db.collection<GridMemberLedger>(COL_MEMBERS)
      .find({}, { projection: { _id: 0 } })
      .sort({ lifetimeCreds: -1 }).limit(limit).toArray();
    return docs.map((l) => ({
      memberId:      l.memberId,
      username:      l.username,
      level:         l.level,
      lifetimeCreds: l.lifetimeCreds,
    }));
  }

  // ── Coupons ───────────────────────────────────────────────────────────────

  async listCouponsByMember(memberId: string, limit = 8) {
    const db = await this.db();
    return db.collection<GridCouponRecord>(COL_COUPONS)
      .find({ memberId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 }).limit(limit).toArray() as unknown as GridCouponRecord[];
  }

  async listCouponsByStatus(memberId: string, status: GridCouponStatus) {
    const db = await this.db();
    return db.collection<GridCouponRecord>(COL_COUPONS)
      .find({ memberId, status }, { projection: { _id: 0 } })
      .toArray() as unknown as GridCouponRecord[];
  }

  async saveCoupon(coupon: GridCouponRecord) {
    const db = await this.db();
    // insertOne with ignore on duplicate key (unique index on `code`)
    try {
      await db.collection<GridCouponRecord>(COL_COUPONS).insertOne({ ...coupon } as never);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        // Duplicate code — silently ignore (idempotent)
        console.warn("[THE_GRID_REPO] Duplicate coupon code ignored:", coupon.code);
      } else {
        throw e;
      }
    }
    return coupon;
  }

  async markCouponUsed(code: string, orderId: string, usedAt: string) {
    const db = await this.db();
    const result = await db.collection<GridCouponRecord>(COL_COUPONS).updateOne(
      {
        code,
        status: { $nin: ["USED", "EXPIRED"] }, // Idempotent guard
      },
      { $set: { status: "USED", usedAt, orderId } }
    );
    return result.modifiedCount > 0;
  }

  async expireStaleCoupons(memberId: string, now: string) {
    const db = await this.db();
    const result = await db.collection<GridCouponRecord>(COL_COUPONS).updateMany(
      {
        memberId,
        status:    "ACTIVE",
        expiresAt: { $lt: now },
      },
      { $set: { status: "EXPIRED" } }
    );
    return result.modifiedCount;
  }

  // ── Credit transactions ───────────────────────────────────────────────────

  async saveCreditTransaction(tx: CreditTransaction) {
    const db = await this.db();
    try {
      await db.collection<CreditTransaction>(COL_TX).insertOne({ ...tx } as never);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        // Duplicate (memberId, referenceId, type) — idempotent, ignore
        console.warn("[THE_GRID_REPO] Duplicate credit_transaction ignored:", tx.referenceId, tx.type);
      } else {
        throw e;
      }
    }
  }

  async listCreditTransactions(
    memberId: string,
    opts?: { limit?: number; skip?: number; since?: Date }
  ) {
    const db = await this.db();
    const query: Record<string, unknown> = { memberId };
    if (opts?.since) query.createdAt = { $gte: opts.since.toISOString() };

    return db.collection<CreditTransaction>(COL_TX)
      .find(query, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 20)
      .toArray() as unknown as CreditTransaction[];
  }

  async hasRedeemTransaction(memberId: string, referenceId: string) {
    const db  = await this.db();
    const doc = await db.collection<CreditTransaction>(COL_TX)
      .findOne({ memberId, referenceId, type: "REDEEM" }, { projection: { _id: 0 } });
    return !!doc;
  }

  // ── Order history ─────────────────────────────────────────────────────────

  async saveOrderHistory(order: OrderHistory) {
    const db = await this.db();
    try {
      await db.collection<OrderHistory>(COL_ORDERS).insertOne({ ...order } as never);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        // Duplicate orderId — already processed, skip silently
      } else {
        throw e;
      }
    }
  }

  async getProcessedOrderIds(memberId: string) {
    const db   = await this.db();
    const docs = await db.collection<OrderHistory>(COL_ORDERS)
      .find({ memberId }, { projection: { _id: 0, orderId: 1 } })
      .toArray();
    return new Set(docs.map((d) => d.orderId));
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getAllMemberIds() {
    const db   = await this.db();
    const docs = await db.collection<GridMemberLedger>(COL_MEMBERS)
      .find({}, { projection: { _id: 0, memberId: 1 } }).toArray();
    return docs.map((d) => d.memberId);
  }

  async getTransactionSummary(memberId: string, since: Date) {
    const db = await this.db();

    const agg = await db.collection<CreditTransaction>(COL_TX).aggregate([
      {
        $match: {
          memberId,
          createdAt: { $gte: since.toISOString() },
        },
      },
      {
        $group: {
          _id:      null,
          earned:   { $sum: { $cond: [{ $in: ["$type", ["EARN", "BONUS"]] }, "$amount", 0] } },
          redeemed: { $sum: { $cond: [{ $eq:  ["$type", "REDEEM"] },          "$amount", 0] } },
          txCount:  { $sum: 1 },
        },
      },
    ]).toArray();

    const row = agg[0] as { earned?: number; redeemed?: number; txCount?: number } | undefined;
    return {
      earned:   row?.earned   ?? 0,
      redeemed: row?.redeemed ?? 0,
      txCount:  row?.txCount  ?? 0,
    };
  }

  async getCouponSummary(memberId: string) {
    const db = await this.db();

    const agg = await db.collection<GridCouponRecord>(COL_COUPONS).aggregate([
      { $match: { memberId } },
      {
        $group: {
          _id:               "$status",
          count:             { $sum: 1 },
          totalValueRupees:  { $sum: "$valueRupees" },
        },
      },
    ]).toArray() as Array<{ _id: string; count: number; totalValueRupees: number }>;

    const byStatus = Object.fromEntries(agg.map((r) => [r._id, r]));

    return {
      total:   agg.reduce((s, r) => s + r.count, 0),
      active:  byStatus["ACTIVE"]?.count  ?? 0,
      used:    byStatus["USED"]?.count    ?? 0,
      expired: byStatus["EXPIRED"]?.count ?? 0,
      failed:  byStatus["FAILED"]?.count  ?? 0,
      totalSavingsRupees: byStatus["USED"]?.totalValueRupees ?? 0,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function getRepository(): GridRepository {
  const { MONGODB_URI } = getEnv();

  if (!MONGODB_URI) {
    if (!global.__GRID_MEM_REPO__) global.__GRID_MEM_REPO__ = new MemoryGridRepository();
    return global.__GRID_MEM_REPO__;
  }

  if (!global.__GRID_MONGO_REPO__) global.__GRID_MONGO_REPO__ = new MongoGridRepository();
  return global.__GRID_MONGO_REPO__;
}