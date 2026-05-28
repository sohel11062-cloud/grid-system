export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";

import { redeemMemberCreds } from "@/server/coupon-service";
import { getConversionRate } from "@/server/economy";
import { AppError, ErrorCode } from "@/server/errors";

import {
  handleRouteError,
  optionsResponse,
  rateLimitResponse,
  successResponse,
} from "@/server/http";

import { checkRateLimit } from "@/server/rate-limiter";

import {
  persistSessionIfRefreshed,
  requireSession,
} from "@/server/require-session";

// ─────────────────────────────────────────────────────────────────────────────
// Validation Schema
// ─────────────────────────────────────────────────────────────────────────────

const redeemSchema = z.object({
  creds: z
    .number({
      invalid_type_error: "creds must be a number",
    })
    .int("creds must be an integer")
    .positive("creds must be positive")
    .max(
      1_000_000,
      "creds cannot exceed 1,000,000",
    ),

  idempotencyKey: z
    .string()
    .min(
      12,
      "idempotencyKey must be at least 12 characters",
    ),
});

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
    // ── Auth ────────────────────────────────────────────────────────────────

    const auth =
      await requireSession(request);

    const memberId =
      auth.session.memberId;

    // ── Rate limiting ───────────────────────────────────────────────────────

    const rl = checkRateLimit(
      `redeem:${memberId}`,
      5,
      120_000,
    );

    if (!rl.allowed) {
      return rateLimitResponse(
        rl,
        request,
      );
    }

    // ── Parse JSON ──────────────────────────────────────────────────────────

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      throw new AppError(
        "Invalid JSON body.",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // ── Validate body ───────────────────────────────────────────────────────

    const parsed =
      redeemSchema.safeParse(raw);

    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues
          .map((i) => i.message)
          .join("; "),
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const conversionRate =
      Number(
        await getConversionRate(),
      );

    if (
      !Number.isFinite(conversionRate) ||
      conversionRate <= 0 ||
      parsed.data.creds % conversionRate !== 0
    ) {
      throw new AppError(
        `creds must convert to a whole rupee at the current rate (${conversionRate} Creds = ₹1).`,
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // ── Resolve idempotency key ─────────────────────────────────────────────

    const key =
      request.headers.get("idempotency-key") ??
      request.headers.get("x-idempotency-key") ??
      parsed.data.idempotencyKey;

    if (!key || key.length < 12) {
      throw new AppError(
        "Missing valid idempotency key.",
        400,
        ErrorCode.IDEMPOTENCY_REQUIRED,
      );
    }

    // ── Anti-fraud safety threshold ─────────────────────────────────────────

    if (parsed.data.creds > 100_000) {
      throw new AppError(
        "Redemption amount exceeds security threshold.",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // ── Structured security logging ─────────────────────────────────────────

    console.log(
      "[GRID_REDEEM_REQUEST]",
      {
        memberId,
        creds: parsed.data.creds,
        ip:
          request.headers.get(
            "x-forwarded-for",
          ) ?? "unknown",
      },
    );

    // ── Execute redemption ──────────────────────────────────────────────────

    const result =
      await redeemMemberCreds(
        memberId,
        parsed.data.creds,
        key,
      );

    // ── Success logging ─────────────────────────────────────────────────────

    console.log(
      "[GRID_REDEEM_SUCCESS]",
      {
        memberId,
        couponCode:
          result.coupon.code,
        creds:
          parsed.data.creds,
      },
    );

    // ── Response ────────────────────────────────────────────────────────────

    const response =
      successResponse(
        {
          coupon: result.coupon,
          dashboard:
            result.dashboard,
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
