export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/admin-auth";
import { reconcileOrder } from "@/server/admin-service";
import { AppError, ErrorCode } from "@/server/errors";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { persistSessionIfRefreshed } from "@/server/require-session";

const schema = z.object({
  memberId: z.string().min(1),
  orderId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(3).max(8).default("INR"),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(12).optional(),
});

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    let raw: unknown;
    try { raw = await request.json(); }
    catch { throw new AppError("Invalid JSON body.", 400, ErrorCode.VALIDATION_ERROR); }
    const body = schema.parse(raw);
    const result = await reconcileOrder({
      actor: { memberId: auth.user.memberId, email: auth.user.email },
      ...body,
      idempotencyKey:
        request.headers.get("idempotency-key") ??
        request.headers.get("x-idempotency-key") ??
        body.idempotencyKey,
    });
    const response = successResponse(result, 200, request);
    await persistSessionIfRefreshed(response, auth);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
