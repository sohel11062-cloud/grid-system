export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { getDashboardForMember } from "@/server/grid-service";
import {
  applyCors,
  handleRouteError,
  optionsResponse,
  rateLimitResponse,
  successResponse,
} from "@/server/http";
import { persistSessionIfRefreshed, requireSession } from "@/server/require-session";
import { checkRateLimit } from "@/server/rate-limiter";

/** 3 manual syncs per member per minute */
const SYNC_LIMIT     = 3;
const SYNC_WINDOW_MS = 60 * 1000;

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────
    const authState = await requireSession(request);
    const memberId  = authState.session.memberId;

    // ── 2. Rate limit ────────────────────────────────────────────────────
    const rl = checkRateLimit(`sync:${memberId}`, SYNC_LIMIT, SYNC_WINDOW_MS);
    if (!rl.allowed) {
      return rateLimitResponse(rl, request);
    }

    // ── 3. Force sync ─────────────────────────────────────────────────────
    const dashboard = await getDashboardForMember(memberId, true);
    const response  = successResponse(
      { message: "Ledger resynced from Wix.", dashboard },
      200,
      request
    );

    await persistSessionIfRefreshed(response, authState);
    return response;

  } catch (error) {
    return handleRouteError(error, request);
  }
}