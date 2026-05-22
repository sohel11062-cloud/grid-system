export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { startLoginFlow }            from "@/server/auth-service";
import { setOauthCookie }            from "@/server/session";
import { handleRouteError, applySecurityHeaders } from "@/server/http";

/**
 * GET /api/auth/login
 *
 * Initiates the Wix-managed OAuth / PKCE login flow:
 * 1. Generates PKCE state (codeVerifier, codeChallenge) via the Wix SDK.
 * 2. Stores the full OauthData in an encrypted httpOnly cookie.
 * 3. Redirects the browser to the Wix login page.
 *
 * The cookie is later read at /api/auth/exchange to complete the PKCE exchange.
 * Query param `returnTo` (URL-encoded) controls where the user lands after login.
 */
export async function GET(request: NextRequest) {
  try {
    const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";

    // SDK-backed PKCE state generation + Wix login URL (no in-memory store).
    const { redirectUrl, oauthState } = await startLoginFlow(returnTo);

    const response = NextResponse.redirect(redirectUrl);

    // Persist the OauthData (incl. codeVerifier) in an encrypted httpOnly cookie.
    await setOauthCookie(response, oauthState);

    applySecurityHeaders(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
