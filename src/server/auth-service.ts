import "server-only";

import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { MSG } from "@/server/brand";
import {
  exchangeCodeForWixTokens,
  generateOAuthLoginData,
  getAuthenticatedMember,
  refreshWixTokens,
} from "@/server/wix-headless-client";
import type { GridOAuthState, GridRefreshTokenRole, GridSession } from "@/server/session";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AuthState {
  session:   GridSession;
  refreshed: boolean;
}

// ─── Start login flow ─────────────────────────────────────────────────────────

/**
 * Initiates the Wix-managed OAuth / PKCE login flow.
 *
 * Generates a one-time PKCE state and returns:
 *   - `redirectUrl`  – the Wix login URL to redirect the browser to.
 *   - `oauthState`   – the full PKCE object that MUST be stored in an encrypted
 *                      httpOnly cookie before issuing the redirect.  The cookie
 *                      is read back at the `/auth/callback` step so the server
 *                      can verify the state and supply the `codeVerifier`.
 *
 * Nothing is stored in process memory — safe for serverless / multi-instance.
 */
export async function startLoginFlow(returnTo?: string): Promise<{
  redirectUrl: string;
  oauthState:  GridOAuthState;
}> {
  const { APP_URL } = getEnv();
  const redirectUri  = `${APP_URL}/auth/callback`;
  const originalUri  = returnTo ?? "/";

  // SDK generates state, codeVerifier, and codeChallenge internally.
  const { oauthData, loginUrl } =
  await generateOAuthLoginData(
    redirectUri,
    originalUri
  );
  
  const oauthState: GridOAuthState = {
    state:         oauthData.state,
    codeChallenge: oauthData.codeChallenge,
    codeVerifier:  oauthData.codeVerifier,
    redirectUri:   oauthData.redirectUri,
    originalUri:   oauthData.originalUri,
    createdAt:     new Date().toISOString(),
  };

  return { redirectUrl: loginUrl, oauthState };
}

// ─── Exchange auth code for an encrypted session ──────────────────────────────

/**
 * Called from `POST /api/auth/exchange` after Wix redirects back with
 * `?code=…&state=…`.
 *
 * 1. Validates the `state` against the cookie to prevent CSRF.
 * 2. Calls the Wix SDK to exchange the code for tokens (PKCE-verified).
 * 3. Fetches the authenticated member's profile.
 * 4. Returns a `GridSession` ready to be encrypted into an httpOnly cookie.
 */
export async function exchangeCodeForSession(params: {
  code:       string;
  state:      string;
  oauthState: GridOAuthState | null;
}): Promise<GridSession> {
  const { code, state, oauthState } = params;

  if (!oauthState) {
    throw new AppError(
      "OAuth state cookie not found. The session may have expired — please sign in again.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // CSRF guard — `state` in the URL must match what we stored in the cookie.
  if (state !== oauthState.state) {
    throw new AppError(
      "OAuth state mismatch — possible CSRF attempt. Please restart the login flow.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // Exchange the auth code for Wix member tokens (PKCE-verified via codeVerifier).
  const tokens = await exchangeCodeForWixTokens(code, oauthState);

  // Fetch the member profile using the freshly obtained access token.
  const member  = await getAuthenticatedMember(tokens);
  const now     = new Date().toISOString();

  // Resolve a display name with graceful fallbacks.
  const username =
    member.profile.nickname?.trim()                                              ||
    [member.contact.firstName, member.contact.lastName]
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .join(" ")                                                                  ||
    member.loginEmail.split("@")[0]?.trim()                                      ||
    "GRID_USER";

  const session: GridSession = {
    memberId:             member.id,
    contactId:            member.contactId,
    email:                member.loginEmail,
    username,
    accessToken:          tokens.accessToken.value,
    refreshToken:         tokens.refreshToken.value,
    // Members always get the MEMBER role; store it explicitly for the refresh flow.
    refreshTokenRole:     "member" satisfies GridRefreshTokenRole,
    accessTokenExpiresAt: new Date(tokens.accessToken.expiresAt).toISOString(),
    createdAt:            now,
  };

  return session;
}

// ─── Refresh the session if the access token is near expiry ───────────────────

/**
 * Transparently refreshes the Wix access token when it is within 5 minutes
 * of expiry.  Returns the (possibly refreshed) session and a flag indicating
 * whether the cookie needs to be rewritten.
 *
 * On refresh failure the original session is returned unchanged so the next
 * API call fails with a 401 rather than logging the user out proactively.
 */
export async function refreshSessionIfNeeded(
  session: GridSession,
): Promise<AuthState> {
  const expiresAtMs = new Date(session.accessTokenExpiresAt).getTime();
  const fiveMinMs   = 5 * 60 * 1_000;

  if (Date.now() < expiresAtMs - fiveMinMs) {
    return { session, refreshed: false };
  }

  try {
    const tokens = await refreshWixTokens(session.refreshToken);

    const refreshed: GridSession = {
      ...session,
      accessToken:          tokens.accessToken.value,
      // Use the new refresh token when Wix issues one; fall back to the existing one.
      refreshToken:         tokens.refreshToken.value || session.refreshToken,
      refreshTokenRole:     "member" satisfies GridRefreshTokenRole,
      accessTokenExpiresAt: new Date(tokens.accessToken.expiresAt).toISOString(),
    };

    return { session: refreshed, refreshed: true };
  } catch {
    // Refresh failed — return the original session.
    // The next protected API call will surface a 401 if the token has truly expired.
    console.warn("[GRID_AUTH] Token refresh failed — continuing with existing session.");
    return { session, refreshed: false };
  }
}