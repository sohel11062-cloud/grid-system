import "server-only";

import { MongoClient } from "mongodb";

import type { GridCouponRecord, GridLeaderboardEntry, GridMemberLedger } from "@/lib/grid";
import { getEnv } from "@/server/env";

export interface GridRepository {
  getMemberLedger(memberId: string): Promise<GridMemberLedger | null>;
  upsertMemberLedger(ledger: GridMemberLedger): Promise<GridMemberLedger>;
  listTopMembers(limit: number): Promise<GridLeaderboardEntry[]>;
  listCouponsByMember(memberId: string, limit?: number): Promise<GridCouponRecord[]>;
  saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord>;
}

const MEMBERS_COLLECTION = "grid_members";
const COUPONS_COLLECTION = "grid_coupons";

declare global {
  // eslint-disable-next-line no-var
  var __THE_GRID_MONGO_CLIENT__: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __THE_GRID_MEMORY_REPOSITORY__: MemoryGridRepository | undefined;
  // eslint-disable-next-line no-var
  var __THE_GRID_MONGO_REPOSITORY__: MongoGridRepository | undefined;
}

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

  async listTopMembers(limit: number) {
    return Array.from(this.members.values())
      .sort((a, b) => b.lifetimeCreds - a.lifetimeCreds)
      .slice(0, limit)
      .map((ledger) => ({
        memberId: ledger.memberId,
        username: ledger.username,
        level: ledger.level,
        lifetimeCreds: ledger.lifetimeCreds
      }));
  }

  async listCouponsByMember(memberId: string, limit = 5) {
    return (this.coupons.get(memberId) ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async saveCoupon(coupon: GridCouponRecord) {
    const current = this.coupons.get(coupon.memberId) ?? [];
    current.push(coupon);
    this.coupons.set(coupon.memberId, current);
    return coupon;
  }
}

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
    return (await db.collection<GridMemberLedger>(MEMBERS_COLLECTION).findOne({ memberId })) ?? null;
  }

  async upsertMemberLedger(ledger: GridMemberLedger) {
    const db = await this.getDb();

    await db.collection<GridMemberLedger>(MEMBERS_COLLECTION).updateOne(
      { memberId: ledger.memberId },
      {
        $set: ledger,
        $setOnInsert: {
          createdAt: ledger.createdAt
        }
      },
      { upsert: true }
    );

    return ledger;
  }

  async listTopMembers(limit: number) {
    const db = await this.getDb();

    const ledgers = (await db
      .collection<GridMemberLedger>(MEMBERS_COLLECTION)
      .find({})
      .sort({ lifetimeCreds: -1 })
      .limit(limit)
      .toArray()) as unknown as GridMemberLedger[];

    return ledgers.map((ledger) => ({
      memberId: ledger.memberId,
      username: ledger.username,
      level: ledger.level,
      lifetimeCreds: ledger.lifetimeCreds
    }));
  }

  async listCouponsByMember(memberId: string, limit = 5) {
    const db = await this.getDb();

    return (await db
      .collection<GridCouponRecord>(COUPONS_COLLECTION)
      .find({ memberId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()) as unknown as GridCouponRecord[];
  }

  async saveCoupon(coupon: GridCouponRecord) {
    const db = await this.getDb();
    await db.collection<GridCouponRecord>(COUPONS_COLLECTION).insertOne(coupon);
    return coupon;
  }
}

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
