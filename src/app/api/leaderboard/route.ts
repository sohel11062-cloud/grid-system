export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { getRepository } from "@/server/storage/repository";
import { getEnv }        from "@/server/env";

interface CachedBoard {
  data:     unknown[];
  builtAt:  string;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __GRID_LEADER_CACHE__: CachedBoard | undefined;
}

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function GET(request: NextRequest) {
  try {
    const { LEADERBOARD_CACHE_TTL_MS } = getEnv();
    const now = Date.now();

    if (
      global.__GRID_LEADER_CACHE__ &&
      global.__GRID_LEADER_CACHE__.expiresAt > now
    ) {
      return successResponse(
        {
          leaderboard: global.__GRID_LEADER_CACHE__.data,
          builtAt:     global.__GRID_LEADER_CACHE__.builtAt,
          cached:      true,
        },
        200,
        request,
      );
    }

    const limit   = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("limit") ?? "10"), 1),
      50,
    );
    const entries = await getRepository().listTopMembers(limit);

    const leaderboard = entries.map((e, i) => ({
      rank:        i + 1,
      memberId:    e.memberId,
      name:        e.username,
      level:       e.level,
      totalCreds:  e.lifetimeCreds,
    }));

    const builtAt = new Date().toISOString();
    global.__GRID_LEADER_CACHE__ = {
      data:      leaderboard,
      builtAt,
      expiresAt: now + LEADERBOARD_CACHE_TTL_MS,
    };

    return successResponse({ leaderboard, builtAt, cached: false }, 200, request);
  } catch (error) { return handleRouteError(error, request); }
}
