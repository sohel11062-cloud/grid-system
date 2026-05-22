export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z }           from "zod";
import { redeemMemberCreds } from "@/server/coupon-service";
import { AppError, ErrorCode } from "@/server/errors";
import {
  handleRouteError,
  optionsResponse,
  rateLimitResponse,
  successResponse,
} from "@/server/http";
import { checkRateLimit }             from "@/server/rate-limiter";
import { persistSessionIfRefreshed, requireSession } from "@/server/require-session";

const redeemSchema = z.object({
  creds: z
    .number({ invalid_type_error: "creds must be a number" })
    .int("creds must be an integer")
    .positive("creds must be positive")
    .multipleOf(100, "creds must be a multiple of 100")
    .max(1_000_000, "creds cannot exceed 1,000,000"),
  idempotencyKey: z.string().min(12).optional(),
});

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function POST(request: NextRequest) {
  try {
    const auth     = await requireSession(request);
    const memberId = auth.session.memberId;

    const rl = checkRateLimit(`redeem:${memberId}`, 5, 120_000);
    if (!rl.allowed) return rateLimitResponse(rl, request);

    let raw: unknown;
    try { raw = await request.json(); }
    catch { throw new AppError("Invalid JSON body.", 400, ErrorCode.VALIDATION_ERROR); }

    const parsed = redeemSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues.map((i) => i.message).join("; "),
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const key =
      request.headers.get("idempotency-key") ??
      request.headers.get("x-idempotency-key") ??
      parsed.data.idempotencyKey;

    const result   = await redeemMemberCreds(memberId, parsed.data.creds, key);
    const response = successResponse(
      { coupon: result.coupon, dashboard: result.dashboard },
      200,
      request,
    );
    await persistSessionIfRefreshed(response, auth);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
