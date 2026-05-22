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

import type {
  GridOAuthState,
  GridRefreshTokenRole,
  GridSession,
} from "@/server/session";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AuthState {
  session: GridSession;
  refreshed: boolean;
}

// ─── Start login flow ─────────────────────────────────────────────────────────

export async function startLoginFlow(
  returnTo?: string
): Promise<{
  redirectUrl: string;
  oauthState: GridOAuthState;
}> {

  const { APP_URL } = getEnv();

  // IMPORTANT:
  // MUST match Wix dashboard EXACTLY
  const redirectUri =
    `${APP_URL}/auth/callback`;

  // Where user should land AFTER auth
  const originalUri =
    returnTo ?? "/";

  // Generate Wix OAuth login URL + PKCE data
  const { oauthData, loginUrl } =
    await generateOAuthLoginData(
      redirectUri,
      originalUri
    );

  // Persist ALL PKCE state server-side in encrypted cookie
  const oauthState: GridOAuthState = {
    state: oauthData.state,

    codeChallenge:
      oauthData.codeChallenge,

    codeVerifier:
      oauthData.codeVerifier,

    // IMPORTANT:
    // use OUR OWN values
    redirectUri,

    originalUri,

    createdAt:
      new Date().toISOString(),
  };

  return {
    redirectUrl: loginUrl,
    oauthState,
  };
}

// ─── Exchange auth code for encrypted session ────────────────────────────────

export async function exchangeCodeForSession(params: {
  code: string;
  state: string;
  oauthState: GridOAuthState | null;
}): Promise<GridSession> {

  const {
    code,
    state,
    oauthState,
  } = params;

  if (!oauthState) {
    throw new AppError(
      "OAuth state cookie not found. Please sign in again.",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  // CSRF protection
  if (state !== oauthState.state) {
    throw new AppError(
      "OAuth state mismatch. Please restart login.",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  // Exchange code → Wix tokens
  const tokens =
    await exchangeCodeForWixTokens(
      code,
      oauthState
    );

  // Fetch member profile
  const member =
    await getAuthenticatedMember(tokens);

  const now =
    new Date().toISOString();

  // Display name fallback chain
  const username =
    member.profile.nickname?.trim() ||

    [
      member.contact.firstName,
      member.contact.lastName,
    ]
      .filter(
        (s): s is string =>
          typeof s === "string" &&
          s.trim().length > 0
      )
      .join(" ") ||

    member.loginEmail
      .split("@")[0]
      ?.trim() ||

    "GRID_USER";

  const session: GridSession = {
    memberId:
      member.id,

    contactId:
      member.contactId,

    email:
      member.loginEmail,

    username,

    accessToken:
      tokens.accessToken.value,

    refreshToken:
      tokens.refreshToken.value,

    refreshTokenRole:
      "member" satisfies GridRefreshTokenRole,

    accessTokenExpiresAt:
      new Date(
        tokens.accessToken.expiresAt
      ).toISOString(),

    createdAt:
      now,
  };

  return session;
}

// ─── Refresh session if access token is expiring ─────────────────────────────

export async function refreshSessionIfNeeded(
  session: GridSession
): Promise<AuthState> {

  const expiresAtMs =
    new Date(
      session.accessTokenExpiresAt
    ).getTime();

  const fiveMinMs =
    5 * 60 * 1000;

  // Still valid
  if (Date.now() < expiresAtMs - fiveMinMs) {
    return {
      session,
      refreshed: false,
    };
  }

  try {

    const tokens =
      await refreshWixTokens(
        session.refreshToken
      );

    const refreshed: GridSession = {
      ...session,

      accessToken:
        tokens.accessToken.value,

      refreshToken:
        tokens.refreshToken.value ||
        session.refreshToken,

      refreshTokenRole:
        "member" satisfies GridRefreshTokenRole,

      accessTokenExpiresAt:
        new Date(
          tokens.accessToken.expiresAt
        ).toISOString(),
    };

    return {
      session: refreshed,
      refreshed: true,
    };

  } catch {

    console.warn(
      "[GRID_AUTH] Token refresh failed"
    );

    return {
      session,
      refreshed: false,
    };
  }
}