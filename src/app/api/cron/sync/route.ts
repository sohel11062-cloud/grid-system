export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { syncAllMembers } from "@/server/grid-service";
import { handleRouteError, applySecurityHeaders } from "@/server/http";

function assertSecret(req: NextRequest) {
  const env   = getEnv();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
    || (req.headers.get("x-cron-secret") ?? "").trim();
  if (!token || token !== env.CRON_SECRET)
    throw new AppError("Unauthorized.", 401, ErrorCode.AUTH_REQUIRED);
}

export async function GET(request: NextRequest) {
  try {
    assertSecret(request);
    const result   = await syncAllMembers();
    const response = NextResponse.json({ success: true, runAt: new Date().toISOString(), ...result });
    applySecurityHeaders(response);
    return response;
  } catch (error) { return handleRouteError(error); }
}
