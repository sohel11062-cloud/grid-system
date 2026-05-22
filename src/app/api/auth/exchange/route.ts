export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest }              from "next/server";
import { exchangeCodeForSession }   from "@/server/auth-service";
import { AppError, ErrorCode }      from "@/server/errors";
import {
  handleRouteError,
  optionsResponse,
  successResponse,
} from "@/server/http";
import {
  clearOauthCookie,
  readOauthCookie,
  setSessionCookie,
} from "@/server/session";

export async function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

/**
 * POST /api/auth/exchange
 *
 * Called by the /auth/callback client page after Wix redirects back with
 * `?code=…&state=…`.
 *
 * Flow:
 * 1. Reads the encrypted OauthData from the cookie set at /api/auth/login.
 * 2. Validates the `state` param against the cookie (CSRF guard).
 * 3. Calls the Wix SDK to exchange the code for member tokens (PKCE-verified).
 * 4. Fetches the member profile to build the GridSession.
 * 5. Writes the encrypted session cookie and clears the OAuth state cookie.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Parse body ───────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new AppError("Invalid JSON body.", 400, ErrorCode.VALIDATION_ERROR);
    }

    const code  = typeof body.code  === "string" ? body.code.trim()  : "";
    const state = typeof body.state === "string" ? body.state.trim() : "";

    if (!code || !state) {
      throw new AppError(
        "Missing required fields: code and state.",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // ── Recover the OauthData that was persisted at login initiation ─────────
    const oauthState = await readOauthCookie(request);

    // ── Exchange code → session (CSRF + PKCE verified inside) ────────────────
    const session = await exchangeCodeForSession({ code, state, oauthState });

    // ── Write encrypted session cookie, clear the OAuth state cookie ─────────
    const response = successResponse(
      {
        memberId: session.memberId,
        returnTo: oauthState?.originalUri ?? "/",
      },
      200,
      request,
    );

    await setSessionCookie(response, session);
    clearOauthCookie(response);

    return response;
  } catch (error) {
    return handleRouteError(error, request);
  }
}
