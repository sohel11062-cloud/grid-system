export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  getDashboardForMember,
} from "@/server/grid-service";

import {
  handleRouteError,
  optionsResponse,
  rateLimitResponse,
  successResponse,
} from "@/server/http";

import {
  checkRateLimit,
} from "@/server/rate-limiter";

import {
  persistSessionIfRefreshed,
  requireSession,
} from "@/server/require-session";

import {
  AppError,
  ErrorCode,
} from "@/server/errors";

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function OPTIONS(
  req: NextRequest,
) {
  return optionsResponse(req);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
) {
  try {
    // ── Require authenticated session ───────────────────────────────────────

    const auth =
      await requireSession(request);

    const memberId =
      auth.session.memberId;

    // ── Rate limiting ───────────────────────────────────────────────────────

    const rl = checkRateLimit(
      `sync:${memberId}`,
      3,
      60_000,
    );

    if (!rl.allowed) {
      return rateLimitResponse(
        rl,
        request,
      );
    }

    // ── Structured logging ──────────────────────────────────────────────────

    console.log(
      "[GRID_SYNC_REQUEST]",
      {
        memberId,

        ip:
          request.headers.get(
            "x-forwarded-for",
          ) ?? "unknown",

        userAgent:
          request.headers.get(
            "user-agent",
          ) ?? "unknown",
      },
    );

    // ── Execute synchronization ─────────────────────────────────────────────

    const dashboard =
      await getDashboardForMember(
        memberId,
        true,
      );

    if (!dashboard) {
      throw new AppError(
        "Unable to synchronize Grid ledger.",
        500,
        ErrorCode.INTERNAL_ERROR,
      );
    }

    // ── Success logging ─────────────────────────────────────────────────────

    console.log(
  "[GRID_SYNC_SUCCESS]",
  {
    memberId,
  },
);

    // ── Response ────────────────────────────────────────────────────────────

    const response =
      successResponse(
        {
          message:
            "Grid ledger synchronized.",

          dashboard,
        },
        200,
        request,
      );

    // ── Persist refreshed auth session ──────────────────────────────────────

    await persistSessionIfRefreshed(
      response,
      auth,
    );

    return response;
  } catch (error) {
    return handleRouteError(
      error,
      request,
    );
  }
}