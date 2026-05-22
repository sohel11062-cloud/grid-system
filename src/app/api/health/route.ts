export const runtime = "nodejs";

import { NextResponse }           from "next/server";
import { applySecurityHeaders }   from "@/server/http";
import { getEnv }                 from "@/server/env";

export async function GET() {
  const env = getEnv();
  const response = NextResponse.json({
    success:   true,
    status:    "ok",
    service:   "THE_GRID",
    timestamp: new Date().toISOString(),
    version:   "1.0.0",
    persistence: env.MONGODB_URI ? "mongodb" : "memory-dev",
  });
  applySecurityHeaders(response);
  return response;
}
