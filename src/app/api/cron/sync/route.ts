export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { syncAllMembers } from "@/server/grid-service";
import { handleRouteError, applySecurityHeaders } from "@/server/http";

function assertCronSecret(request: NextRequest): void {
  const env   = getEnv();
  const auth  = request.headers.get("authorization") ?? "";
  const token =
    auth.replace(/^Bearer\s+/i, "").trim() ||
    (request.headers.get("x-cron-secret") ?? "").trim();

  if (!token || token !== env.CRON_SECRET) {
    throw new AppError("Invalid or missing cron secret.", 401, ErrorCode.AUTH_REQUIRED);
  }
}

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(request);
    const result   = await syncAllMembers();
    const response = NextResponse.json({
      success: true,
      runAt:   new Date().toISOString(),
      ...result,
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}