export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { startLoginFlow } from "@/server/auth-service";
import { setOauthCookie } from "@/server/session";
import { handleRouteError, applySecurityHeaders } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
    const { redirectUrl, oauthState } = await startLoginFlow(returnTo);
    const response = NextResponse.redirect(redirectUrl);
    await setOauthCookie(response, oauthState);
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
