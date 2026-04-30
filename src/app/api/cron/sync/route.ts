import { NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { syncAllMembers } from "@/server/grid-service";
import { handleRouteError } from "@/server/http";

export const dynamic = "force-dynamic";

function assertCronSecret(request: NextRequest) {
  const env = getEnv();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret");

  if (!token || token !== env.CRON_SECRET) {
    throw new AppError("Invalid cron secret.", 401);
  }
}

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(request);
    const result = await syncAllMembers();
    return NextResponse.json({
      ok: true,
      runAt: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
