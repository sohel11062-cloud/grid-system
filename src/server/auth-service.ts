import "server-only";

import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";
import type { GridOAuthState, GridSession } from "@/server/session";
import {
  createHeadlessWixClient,
  createOauthStateRecord,
  getAuthenticatedMember,
  sessionToSdkTokens,
  toOauthData,
  tokensToSessionFields,
} from "@/server/wix-headless-client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveUsername(m: {
  nickname: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  if (m.nickname?.trim()) return m.nickname.trim();
  const full = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (m.email?.trim()) return m.email.trim();
  return "GRID_USER";
}

function sanitiseReturnUri(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  try {
    const candidate = new URL(raw);
    const base = new URL(fallback);
    return candidate.origin === base.origin ? candidate.toString() : fallback;
  } catch {
    return fallback;
  }
}

// ─── Login flow ───────────────────────────────────────────────────────────────

export async function startLoginFlow(returnTo?: string) {
  const env = getEnv();
  const redirectUri = new URL("/auth/callback", env.APP_URL).toString();
  const client = createHeadlessWixClient();

  const oauthData = client.auth.generateOAuthData(
    redirectUri,
    sanitiseReturnUri(returnTo, env.APP_URL)
  );

  const { authUrl } = await client.auth.getAuthUrl(oauthData, {
    prompt: "login",
    responseMode: "fragment",
  });

  return {
    redirectUrl:  authUrl,
    oauthState:   createOauthStateRecord(oauthData) satisfies GridOAuthState,
  };
}

// ─── Code exchange ────────────────────────────────────────────────────────────

export async function exchangeCodeForSession(input: {
  code: string;
  state: string;
  oauthState: GridOAuthState | null;
}): Promise<GridSession> {
  if (!input.oauthState || input.oauthState.state !== input.state) {
    throw new AppError("OAuth state mismatch or expired. Please restart login.", 401);
  }

  const client = createHeadlessWixClient();
  const tokens = await client.auth.getMemberTokens(
    input.code,
    input.state,
    toOauthData(input.oauthState)
  );

  const member = await getAuthenticatedMember(tokens);

  return {
    memberId:  member.memberId,
    contactId: member.contactId,
    email:     member.email,
    username:  resolveUsername(member),
    ...tokensToSessionFields(tokens),
    createdAt: new Date().toISOString(),
  };
}

// ─── Token refresh ────────────────────────────────────────────────────────────

export async function refreshSessionIfNeeded(
  session: GridSession
): Promise<{ session: GridSession; refreshed: boolean }> {
  const expiresAt = new Date(session.accessTokenExpiresAt).getTime();
  const fiveMinutesMs = 5 * 60 * 1000;

  if (expiresAt > Date.now() + fiveMinutesMs) {
    return { session, refreshed: false };
  }

  const sdkTokens = sessionToSdkTokens(session);
  const client = createHeadlessWixClient(sdkTokens);

  const refreshed = await client.auth.renewToken({
    value: session.refreshToken,
    role: sdkTokens.refreshToken.role,
  });

  return {
    refreshed: true,
    session: {
      ...session,
      ...tokensToSessionFields(refreshed),
    },
  };
}