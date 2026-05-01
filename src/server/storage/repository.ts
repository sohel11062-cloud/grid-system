import "server-only";

import { MongoClient } from "mongodb";
import type {
  GridCouponRecord,
  GridCouponStatus,
  GridLeaderboardEntry,
  GridMemberLedger,
} from "@/lib/grid";
import { getEnv } from "@/server/env";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface GridRepository {
  getMemberLedger(memberId: string): Promise<GridMemberLedger | null>;
  upsertMemberLedger(ledger: GridMemberLedger): Promise<GridMemberLedger>;
  /**
   * Atomically deduct `creds` from `availableCreds` only if
   * `availableCreds >= creds` at the time of the update.
   *
   * Returns:
   *   - Updated ledger  → deduction succeeded
   *   - null            → ledger not found OR insufficient balance (race condition)
   */
  atomicRedemption(memberId: string, creds: number, now: string): Promise<GridMemberLedger | null>;
  listTopMembers(limit: number): Promise<GridLeaderboardEntry[]>;
  listCouponsByMember(memberId: string, limit?: number): Promise<GridCouponRecord[]>;
  listCouponsByStatus(memberId: string, status: GridCouponStatus): Promise<GridCouponRecord[]>;
  saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord>;
}

const COL_MEMBERS = "grid_members";
const COL_COUPONS = "grid_coupons";

declare global {
  // eslint-disable-next-line no-var
  var __GRID_MONGO_CLIENT__: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __GRID_MEM_REPO__: MemoryGridRepository | undefined;
  // eslint-disable-next-line no-var
  var __GRID_MONGO_REPO__: MongoGridRepository | undefined;
}

// ─── In-memory implementation ─────────────────────────────────────────────────

class MemoryGridRepository implements GridRepository {
  private members = new Map<string, GridMemberLedger>();
  private coupons = new Map<string, GridCouponRecord[]>();

  async getMemberLedger(memberId: string) {
    return this.members.get(memberId) ?? null;
  }

  async upsertMemberLedger(ledger: GridMemberLedger) {
    // Deep-copy to prevent external mutation of stored state
    this.members.set(ledger.memberId, { ...ledger });
    return ledger;
  }

  /**
   * Atomic in Node.js single-thread model:
   * There are NO awaits between the read (Map.get) and the write (Map.set),
   * so the event loop cannot interleave another operation between them.
   */
  async atomicRedemption(
    memberId: string,
    creds:    number,
    now:      string
  ): Promise<GridMemberLedger | null> {
    const ledger = this.members.get(memberId);
    if (!ledger) return null;
    if (ledger.availableCreds < creds) return null;

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
      .map((l) => ({
        memberId:      l.memberId,
        username:      l.username,
        level:         l.level,
        lifetimeCreds: l.lifetimeCreds,
      }));
  }

  async listCouponsByMember(memberId: string, limit = 8): Promise<GridCouponRecord[]> {
    return (this.coupons.get(memberId) ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async listCouponsByStatus(memberId: string, status: GridCouponStatus): Promise<GridCouponRecord[]> {
    return (this.coupons.get(memberId) ?? []).filter((c) => c.status === status);
  }

  async saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord> {
    const list = this.coupons.get(coupon.memberId) ?? [];
    list.push({ ...coupon });
    this.coupons.set(coupon.memberId, list);
    return coupon;
  }
}

// ─── MongoDB implementation ───────────────────────────────────────────────────

class MongoGridRepository implements GridRepository {
  private async db() {
    const { MONGODB_URI, MONGODB_DB_NAME } = getEnv();

    if (!global.__GRID_MONGO_CLIENT__) {
      global.__GRID_MONGO_CLIENT__ = new MongoClient(MONGODB_URI!, {
        serverSelectionTimeoutMS: 10_000,
        connectTimeoutMS:         10_000,
        socketTimeoutMS:          30_000,
      }).connect();
    }

    return (await global.__GRID_MONGO_CLIENT__).db(MONGODB_DB_NAME);
  }

  async getMemberLedger(memberId: string) {
    const db  = await this.db();
    const doc = await db
      .collection<GridMemberLedger>(COL_MEMBERS)
      .findOne({ memberId }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async upsertMemberLedger(ledger: GridMemberLedger) {
    const db = await this.db();
    await db.collection<GridMemberLedger>(COL_MEMBERS).updateOne(
      { memberId: ledger.memberId },
      {
        $set:        { ...ledger },
        $setOnInsert:{ createdAt: ledger.createdAt },
      },
      { upsert: true }
    );
    return ledger;
  }

  /**
   * MongoDB atomic conditional update.
   *
   * The condition `{ memberId, availableCreds: { $gte: creds } }` ensures
   * that the update only executes when the balance is sufficient AT THE
   * MOMENT of the write — not just at pre-check time.
   *
   * If two concurrent requests both pass the pre-check and race here:
   *   - First wins:  availableCreds decremented, returns updated doc
   *   - Second loses: condition doesn't match (balance is now lower), returns null
   *
   * This prevents double-deduction at the database level.
   */
  async atomicRedemption(
    memberId: string,
    creds:    number,
    now:      string
  ): Promise<GridMemberLedger | null> {
    const db = await this.db();

    const result = await db
      .collection<GridMemberLedger>(COL_MEMBERS)
      .findOneAndUpdate(
        {
          memberId,
          availableCreds: { $gte: creds }, // ← THE ATOMIC GUARD
        },
        {
          $inc: {
            redeemedCreds:  creds,
            availableCreds: -creds,
          },
          $set: { updatedAt: now },
        },
        {
          returnDocument: "after",
          projection:     { _id: 0 },
        }
      );

    return result ?? null;
  }

  async listTopMembers(limit: number): Promise<GridLeaderboardEntry[]> {
    const db   = await this.db();
    const docs = await db
      .collection<GridMemberLedger>(COL_MEMBERS)
      .find({}, { projection: { _id: 0 } })
      .sort({ lifetimeCreds: -1 })
      .limit(limit)
      .toArray();

    return docs.map((l) => ({
      memberId:      l.memberId,
      username:      l.username,
      level:         l.level,
      lifetimeCreds: l.lifetimeCreds,
    }));
  }

  async listCouponsByMember(memberId: string, limit = 8): Promise<GridCouponRecord[]> {
    const db = await this.db();
    return db
      .collection<GridCouponRecord>(COL_COUPONS)
      .find({ memberId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray() as unknown as GridCouponRecord[];
  }

  async listCouponsByStatus(memberId: string, status: GridCouponStatus): Promise<GridCouponRecord[]> {
    const db = await this.db();
    return db
      .collection<GridCouponRecord>(COL_COUPONS)
      .find({ memberId, status }, { projection: { _id: 0 } })
      .toArray() as unknown as GridCouponRecord[];
  }

  async saveCoupon(coupon: GridCouponRecord): Promise<GridCouponRecord> {
    const db = await this.db();
    await db.collection<GridCouponRecord>(COL_COUPONS).insertOne({ ...coupon });
    return coupon;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function getRepository(): GridRepository {
  const { MONGODB_URI } = getEnv();

  if (!MONGODB_URI) {
    if (!global.__GRID_MEM_REPO__) {
      global.__GRID_MEM_REPO__ = new MemoryGridRepository();
    }
    return global.__GRID_MEM_REPO__;
  }

  if (!global.__GRID_MONGO_REPO__) {
    global.__GRID_MONGO_REPO__ = new MongoGridRepository();
  }
  return global.__GRID_MONGO_REPO__;
}