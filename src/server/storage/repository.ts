import "server-only";

import { MongoClient } from "mongodb";

import type { GridCouponRecord, GridCouponStatus, GridLeaderboardEntry, GridMemberLedger } from "@/lib/grid";
import { getEnv } from "@/server/env";

export interface GridRepository {
  getMemberLedger(memberId: string): Promise<GridMemberLedger | null>;
  upsertMemberLedger(ledger: GridMemberLedger): Promise<GridMemberLedger>;
  listTopMembers(limit: number): Promise<GridLeaderboardEntry[]>;
  listCouponsByMember(memberId: string, limit?: number): Promise<GridCouponRecord[]>;
  listCouponsByStatus(memberId: string, status: GridCouponStatus): Promise<GridCouponRecord[]>;
  markCouponsAsFailed(memberId: string, fromStatus: GridCouponStatus): Promise<void>;
  saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord>;
}

const MEMBERS_COLL = "grid_members";
const COUPONS_COLL = "grid_coupons";

declare global {
  // eslint-disable-next-line no-var
  var __THE_GRID_MONGO_CLIENT__: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __THE_GRID_MEMORY_REPOSITORY__: MemoryGridRepository | undefined;
  // eslint-disable-next-line no-var
  var __THE_GRID_MONGO_REPOSITORY__: MongoGridRepository | undefined;
}

// ─── In-memory (dev / no-DB mode) ─────────────────────────────────────────────

class MemoryGridRepository implements GridRepository {
  private members = new Map<string, GridMemberLedger>();
  private coupons = new Map<string, GridCouponRecord[]>();

  async getMemberLedger(memberId: string) {
    return this.members.get(memberId) ?? null;
  }

  async upsertMemberLedger(ledger: GridMemberLedger) {
    this.members.set(ledger.memberId, ledger);
    return ledger;
  }

  async listTopMembers(limit: number): Promise<GridLeaderboardEntry[]> {
    return Array.from(this.members.values())
      .sort((a, b) => b.lifetimeCreds - a.lifetimeCreds)
      .slice(0, limit)
      .map((l) => ({ memberId: l.memberId, username: l.username, level: l.level, lifetimeCreds: l.lifetimeCreds }));
  }

  async listCouponsByMember(memberId: string, limit = 5): Promise<GridCouponRecord[]> {
    return (this.coupons.get(memberId) ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async listCouponsByStatus(memberId: string, status: GridCouponStatus): Promise<GridCouponRecord[]> {
    return (this.coupons.get(memberId) ?? []).filter((c) => c.status === status);
  }

  async markCouponsAsFailed(memberId: string, fromStatus: GridCouponStatus): Promise<void> {
    const list = this.coupons.get(memberId) ?? [];
    this.coupons.set(
      memberId,
      list.map((c) => (c.status === fromStatus ? { ...c, status: "FAILED" as GridCouponStatus } : c))
    );
  }

  async saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord> {
    const list = this.coupons.get(coupon.memberId) ?? [];
    list.push(coupon);
    this.coupons.set(coupon.memberId, list);
    return coupon;
  }
}

// ─── MongoDB ───────────────────────────────────────────────────────────────────

class MongoGridRepository implements GridRepository {
  private async getDb() {
    const env = getEnv();
    if (!global.__THE_GRID_MONGO_CLIENT__) {
      global.__THE_GRID_MONGO_CLIENT__ = new MongoClient(env.MONGODB_URI!).connect();
    }
    const client = await global.__THE_GRID_MONGO_CLIENT__;
    return client.db(env.MONGODB_DB_NAME);
  }

  async getMemberLedger(memberId: string) {
    const db = await this.getDb();
    return (await db.collection<GridMemberLedger>(MEMBERS_COLL).findOne({ memberId })) ?? null;
  }

  async upsertMemberLedger(ledger: GridMemberLedger) {
    const db = await this.getDb();
    await db.collection<GridMemberLedger>(MEMBERS_COLL).updateOne(
      { memberId: ledger.memberId },
      { $set: ledger, $setOnInsert: { createdAt: ledger.createdAt } },
      { upsert: true }
    );
    return ledger;
  }

  async listTopMembers(limit: number): Promise<GridLeaderboardEntry[]> {
    const db = await this.getDb();
    const ledgers = await db
      .collection<GridMemberLedger>(MEMBERS_COLL)
      .find({})
      .sort({ lifetimeCreds: -1 })
      .limit(limit)
      .toArray();
    return ledgers.map((l) => ({
      memberId: l.memberId,
      username: l.username,
      level: l.level,
      lifetimeCreds: l.lifetimeCreds,
    }));
  }

  async listCouponsByMember(memberId: string, limit = 5): Promise<GridCouponRecord[]> {
    const db = await this.getDb();
    return db
      .collection<GridCouponRecord>(COUPONS_COLL)
      .find({ memberId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray() as unknown as GridCouponRecord[];
  }

  async listCouponsByStatus(memberId: string, status: GridCouponStatus): Promise<GridCouponRecord[]> {
    const db = await this.getDb();
    return db
      .collection<GridCouponRecord>(COUPONS_COLL)
      .find({ memberId, status })
      .toArray() as unknown as GridCouponRecord[];
  }

  async markCouponsAsFailed(memberId: string, fromStatus: GridCouponStatus): Promise<void> {
    const db = await this.getDb();
    await db.collection<GridCouponRecord>(COUPONS_COLL).updateMany(
      { memberId, status: fromStatus },
      { $set: { status: "FAILED" as GridCouponStatus } }
    );
  }

  async saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord> {
    const db = await this.getDb();
    await db.collection<GridCouponRecord>(COUPONS_COLL).insertOne(coupon);
    return coupon;
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export function getRepository(): GridRepository {
  const env = getEnv();
  if (!env.MONGODB_URI) {
    if (!global.__THE_GRID_MEMORY_REPOSITORY__) {
      global.__THE_GRID_MEMORY_REPOSITORY__ = new MemoryGridRepository();
    }
    return global.__THE_GRID_MEMORY_REPOSITORY__;
  }
  if (!global.__THE_GRID_MONGO_REPOSITORY__) {
    global.__THE_GRID_MONGO_REPOSITORY__ = new MongoGridRepository();
  }
  return global.__THE_GRID_MONGO_REPOSITORY__;
}
