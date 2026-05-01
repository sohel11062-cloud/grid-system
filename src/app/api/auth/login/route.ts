export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { startLoginFlow } from "@/server/auth-service";
import { handleRouteError, applySecurityHeaders } from "@/server/http";
import { setOauthCookie } from "@/server/session";

export async function GET(request: NextRequest) {
  try {
    const returnTo = request.nextUrl.searchParams.get("returnTo") ?? undefined;

    // Basic sanitisation — only allow relative paths or same-origin URLs
    // (full origin validation happens inside startLoginFlow)
    const { redirectUrl, oauthState } = await startLoginFlow(returnTo);

    const response = NextResponse.redirect(redirectUrl);
    await setOauthCookie(response, oauthState);
    applySecurityHeaders(response);
    return response;

  } catch (error) {
    return handleRouteError(error);
  }
}