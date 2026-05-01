export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";

import { redeemMemberCreds } from "@/server/coupon-service";
import {
  applyCors,
  handleRouteError,
  optionsResponse,
  rateLimitResponse,
  successResponse,
} from "@/server/http";
import { persistSessionIfRefreshed, requireSession } from "@/server/require-session";
import { checkRateLimit } from "@/server/rate-limiter";
import { AppError, ErrorCode } from "@/server/errors";

/** 5 redemption attempts per member per 2 minutes */
const REDEEM_LIMIT      = 5;
const REDEEM_WINDOW_MS  = 2 * 60 * 1000;

const redeemSchema = z.object({
  creds: z
    .number({ invalid_type_error: "creds must be a number" })
    .int("creds must be an integer")
    .positive("creds must be positive")
    .multipleOf(100, "creds must be a multiple of 100")
    .max(1_000_000, "creds cannot exceed 1,000,000 per redemption"),
});

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth ─────────────────────────────────────────────────────────
    const authState = await requireSession(request);
    const memberId  = authState.session.memberId;

    // ── 2. Rate limit ────────────────────────────────────────────────────
    const rl = checkRateLimit(`redeem:${memberId}`, REDEEM_LIMIT, REDEEM_WINDOW_MS);
    if (!rl.allowed) {
      return rateLimitResponse(rl, request);
    }

    // ── 3. Parse + validate body ─────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new AppError(
        "Request body must be valid JSON.",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    const parsed = redeemSchema.safeParse(rawBody);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      throw new AppError(msg, 400, ErrorCode.VALIDATION_ERROR);
    }

    // ── 4. Execute redemption ─────────────────────────────────────────────
    const result   = await redeemMemberCreds(memberId, parsed.data.creds);
    const response = successResponse(
      { coupon: result.coupon, dashboard: result.dashboard },
      200,
      request
    );

    await persistSessionIfRefreshed(response, authState);
    return response;

  } catch (error) {
    return handleRouteError(error, request);
  }
}