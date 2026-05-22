export const runtime = "nodejs";

import { NextResponse }           from "next/server";
import { applySecurityHeaders }   from "@/server/http";

export async function GET() {
  const response = NextResponse.json({
    success:   true,
    status:    "ok",
    service:   "THE_GRID",
    timestamp: new Date().toISOString(),
    version:   "1.0.0",
  });
  applySecurityHeaders(response);
  return response;
}
