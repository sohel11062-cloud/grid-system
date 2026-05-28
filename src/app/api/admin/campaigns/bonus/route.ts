export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/admin-auth";
import type { GridTierKey } from "@/lib/grid";

import { triggerBonusCampaign } from "@/server/admin-service";

import {
  AppError,
  ErrorCode,
} from "@/server/errors";

import {
  handleRouteError,
  optionsResponse,
  successResponse,
} from "@/server/http";

import {
  persistSessionIfRefreshed,
} from "@/server/require-session";

// ─────────────────────────────────────────────────────────────────────────────
// Validation Schema
// ─────────────────────────────────────────────────────────────────────────────

const GRID_TIER_KEYS = [
  "THE_GLITCH",
  "NETRUNNER",
  "SYS-ADMIN",
  "THE_ARCHITECT",
  "THE_SINGULARITY",
] as const satisfies readonly GridTierKey[];

const schema = z.object({
  amount: z
    .number({
      invalid_type_error:
        "amount must be a number",
    })
    .int("amount must be an integer")
    .positive("amount must be positive")
    .max(
      250_000,
      "amount cannot exceed 250,000",
    ),

  reason: z
    .string()
    .min(
      3,
      "reason must be at least 3 characters",
    )
    .max(
      500,
      "reason cannot exceed 500 characters",
    ),

  campaignType: z
    .enum([
      "GLOBAL",
      "TIER",
      "EVENT",
    ])
    .default("GLOBAL"),

  targetTier: z
    .enum(GRID_TIER_KEYS)
    .optional(),

  idempotencyKey: z
    .string()
    .min(
      12,
      "idempotencyKey must be at least 12 characters",
    ),
}).superRefine((body, ctx) => {
  if (
    body.campaignType === "TIER" &&
    !body.targetTier
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [
        "targetTier",
      ],
      message:
        "targetTier is required for tier campaigns",
    });
  }
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
    // ── Require admin auth ──────────────────────────────────────────────────

    const auth =
      await requireAdmin(
        request,
        "owner",
      );

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

    // ── Validate request body ───────────────────────────────────────────────

    const body =
      schema.parse(raw);

    // ── Resolve idempotency key ─────────────────────────────────────────────

    const key =
      request.headers.get(
        "idempotency-key",
      ) ??
      request.headers.get(
        "x-idempotency-key",
      ) ??
      body.idempotencyKey;

    if (!key || key.length < 12) {
      throw new AppError(
        "Missing valid idempotency key.",
        400,
        ErrorCode.IDEMPOTENCY_REQUIRED,
      );
    }

    // ── Security guardrails ─────────────────────────────────────────────────

    if (body.amount > 100_000) {
      throw new AppError(
        "Campaign amount exceeds security threshold.",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // ── Structured audit logging ────────────────────────────────────────────

    console.log(
      "[GRID_BONUS_CAMPAIGN_REQUEST]",
      {
        actorMemberId:
          auth.user.memberId,

        actorEmail:
          auth.user.email,

        amount:
          body.amount,

        reason:
          body.reason,

        campaignType:
          body.campaignType,

        targetTier:
          body.targetTier,

        ip:
          request.headers.get(
            "x-forwarded-for",
          ) ?? "unknown",
      },
    );

    // ── Execute campaign ────────────────────────────────────────────────────

    const campaignInput = {
        actor: {
          memberId:
            auth.user.memberId,

          email:
            auth.user.email,
        },

        amount:
          body.amount,

        reason:
          body.reason,

        campaignType:
          body.campaignType,

        targetTiers:
          body.targetTier
            ? [
                body.targetTier,
              ]
            : undefined,

        eventKey:
          body.campaignType === "EVENT"
            ? body.reason
            : undefined,

        idempotencyKey:
          key,
      } as Parameters<
        typeof triggerBonusCampaign
      >[0];

    const result =
      await triggerBonusCampaign(
        campaignInput,
      );

    // ── Success logging ─────────────────────────────────────────────────────

    console.log(
      "[GRID_BONUS_CAMPAIGN_SUCCESS]",
      {
        actorMemberId:
          auth.user.memberId,

        amount:
          body.amount,

        result,
      },
    );

    // ── Response ────────────────────────────────────────────────────────────

    const response =
      successResponse(
        result,
        200,
        request,
      );

    // ── Persist refreshed session ───────────────────────────────────────────

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
