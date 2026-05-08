import "server-only";

import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { MSG } from "@/server/brand";
import {
  buildLoginUrl,
  exchangeCodeForTokens,
  generatePKCE,
  generateState,
  getAuthenticatedMember,
  refreshAccessToken,
} from "@/server/wix-headless-client";
import type { GridOAuthState, GridSession } from "@/server/session";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthState {
  session:   GridSession;
  refreshed: boolean;
}

// ─── Start login flow ─────────────────────────────────────────────────────────

export async function startLoginFlow(returnTo?: string): Promise<{
  redirectUrl: string;
  oauthState:  GridOAuthState;
}> {
  const env         = getEnv();
  const redirectUri = `${env.APP_URL}/auth/callback`;
  const { verifier, challenge } = generatePKCE();
  const state       = generateState();
  const now         = new Date().toISOString();

  const oauthState: GridOAuthState = {
    state,
    codeChallenge: challenge,
    codeVerifier:  verifier,
    redirectUri,
    originalUri:   returnTo ?? "/",
    createdAt:     now,
  };

  const redirectUrl = buildLoginUrl({
    state,
    codeChallenge: challenge,
    redirectUri,
  });

  return { redirectUrl, oauthState };
}

// ─── Exchange code for session ────────────────────────────────────────────────

export async function exchangeCodeForSession(params: {
  code:        string;
  state:       string;
  oauthState:  GridOAuthState | null;
}): Promise<GridSession> {
  const { code, state, oauthState } = params;

  if (!oauthState) {
    throw new AppError(
      "OAuth state not found. Please restart the login flow.",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  if (state !== oauthState.state) {
    throw new AppError(
      "OAuth state mismatch — possible CSRF attempt.",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const tokens = await exchangeCodeForTokens({
    code,
    codeVerifier: oauthState.codeVerifier,
    redirectUri:  oauthState.redirectUri,
  });

  const member  = await getAuthenticatedMember(tokens.access_token);
  const now     = new Date().toISOString();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const username =
    member.profile?.nickname?.trim() ||
    [member.contact?.firstName, member.contact?.lastName]
      .filter(Boolean).join(" ").trim() ||
    member.loginEmail?.trim() ||
    "GRID_USER";

  const session: GridSession = {
    memberId:             member.id,
    contactId:            member.contactId ?? null,
    email:                member.loginEmail ?? "",
    username,
    accessToken:          tokens.access_token,
    refreshToken:         tokens.refresh_token,
    refreshTokenRole:     "member",
    accessTokenExpiresAt: expiresAt,
    createdAt:            now,
  };

  return session;
}

// ─── Refresh session if token nearing expiry ──────────────────────────────────

export async function refreshSessionIfNeeded(
  session: GridSession
): Promise<AuthState> {
  const expiresAt  = new Date(session.accessTokenExpiresAt).getTime();
  const fiveMinMs  = 5 * 60 * 1000;

  if (Date.now() < expiresAt - fiveMinMs) {
    return { session, refreshed: false };
  }

  try {
    const tokens    = await refreshAccessToken(session.refreshToken);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const refreshed: GridSession = {
      ...session,
      accessToken:          tokens.access_token,
      refreshToken:         tokens.refresh_token || session.refreshToken,
      accessTokenExpiresAt: expiresAt,
    };

    return { session: refreshed, refreshed: true };
  } catch {
    // If refresh fails, return the existing session — let the next call
    // fail with 401 rather than proactively killing the session.
    console.warn("[GRID_AUTH] Token refresh failed — returning existing session");
    return { session, refreshed: false };
  }
}
