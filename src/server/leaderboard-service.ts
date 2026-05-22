import "server-only";

import { randomUUID } from "crypto";
import type {
  GridLeaderboardEntry,
  LeaderboardPage,
  LeaderboardSnapshot,
} from "@/lib/grid";
import { getEnv } from "@/server/env";
import { getRepository } from "@/server/storage/repository";

function withMovement(
  entries: GridLeaderboardEntry[],
  previous: LeaderboardSnapshot | null,
): GridLeaderboardEntry[] {
  const previousRanks = new Map(
    previous?.entries.map((entry) => [entry.memberId, entry.rank ?? null]) ?? [],
  );

  return entries.map((entry) => {
    const previousRank = previousRanks.get(entry.memberId) ?? null;
    const rank = entry.rank ?? 0;
    return {
      ...entry,
      previousRank,
      movement: previousRank ? previousRank - rank : 0,
    };
  });
}

async function buildSnapshot(): Promise<LeaderboardSnapshot> {
  const repo = getRepository();
  const env = getEnv();
  const previous = await repo.getLatestLeaderboardSnapshot();
  const [entries, globalStats] = await Promise.all([
    repo.listLeaderboardEntries({ limit: env.LEADERBOARD_SNAPSHOT_SIZE }),
    repo.getGlobalStats(),
  ]);
  const builtAt = new Date();
  const snapshot: LeaderboardSnapshot = {
    id: randomUUID(),
    builtAt: builtAt.toISOString(),
    expiresAt: new Date(builtAt.getTime() + env.LEADERBOARD_CACHE_TTL_MS).toISOString(),
    entries: withMovement(entries, previous),
    globalStats,
  };
  await repo.saveLeaderboardSnapshot(snapshot);
  return snapshot;
}

export async function getLeaderboardPage(input?: {
  page?: number;
  pageSize?: number;
  refresh?: boolean;
}): Promise<LeaderboardPage> {
  const env = getEnv();
  const page = Math.max(Math.floor(input?.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(input?.pageSize ?? 25), 1), 100);
  const offset = (page - 1) * pageSize;

  let snapshot = input?.refresh ? null : await getRepository().getLatestLeaderboardSnapshot();
  let cached = false;

  if (
    snapshot &&
    new Date(snapshot.expiresAt).getTime() > Date.now() &&
    snapshot.entries.length >= offset + pageSize
  ) {
    cached = true;
  } else {
    snapshot = await buildSnapshot();
  }

  return {
    entries: snapshot.entries.slice(offset, offset + pageSize),
    page,
    pageSize,
    total: snapshot.entries.length,
    builtAt: snapshot.builtAt,
    cached,
    globalStats: snapshot.globalStats,
  };
}

export async function getMemberRankContext(memberId: string): Promise<{
  rank: number | null;
  movement: number;
  total: number;
}> {
  const repo = getRepository();
  const [rank, snapshot] = await Promise.all([
    repo.getMemberRank(memberId),
    repo.getLatestLeaderboardSnapshot(),
  ]);
  const current = snapshot?.entries.find((entry) => entry.memberId === memberId);
  return {
    rank: rank.rank,
    movement: current?.movement ?? 0,
    total: rank.total,
  };
}
