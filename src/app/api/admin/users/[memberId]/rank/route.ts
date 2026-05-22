export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/admin-auth";
import { forceRank } from "@/server/admin-service";
import { AppError, ErrorCode } from "@/server/errors";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { persistSessionIfRefreshed } from "@/server/require-session";

const schema = z.object({
  level: z.enum(["THE_GLITCH", "NETRUNNER", "SYS-ADMIN", "THE_ARCHITECT", "THE_SINGULARITY"]).nullable(),
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
    const result = await forceRank({
      actor: { memberId: auth.user.memberId, email: auth.user.email },
      memberId,
      level: body.level,
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
