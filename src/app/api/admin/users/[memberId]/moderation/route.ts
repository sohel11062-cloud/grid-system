export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/admin-auth";
import { moderateUser } from "@/server/admin-service";
import { AppError, ErrorCode } from "@/server/errors";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { persistSessionIfRefreshed } from "@/server/require-session";

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(12).optional(),
});

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    const { memberId } = await context.params;
    let raw: unknown;
    try { raw = await request.json(); }
    catch { throw new AppError("Invalid JSON body.", 400, ErrorCode.VALIDATION_ERROR); }
    const body = schema.parse(raw);
    const result = await moderateUser({
      actor: { memberId: auth.user.memberId, email: auth.user.email },
      memberId,
      status: body.status,
      reason: body.reason,
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
