import { NextRequest, NextResponse } from "next/server";

import { applyCors, handleRouteError, optionsResponse } from "@/server/http";
import { clearOauthCookie, clearSessionCookie } from "@/server/session";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    clearOauthCookie(response);
    return applyCors(response, request);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
