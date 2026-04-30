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
  tokensToSessionFields
} from "@/server/wix-headless-client";

function resolveUsername(member: Awaited<ReturnType<typeof getAuthenticatedMember>>) {
  const parts = [member.firstName, member.lastName].filter(Boolean);
  return member.nickname || parts.join(" ") || member.email || "UNKNOWN_USER";
}

function sanitiseOriginalUri(originalUri: string | undefined, fallbackUri: string) {
  if (!originalUri) {
    return fallbackUri;
  }

  try {
    const candidate = new URL(originalUri);
    const fallback = new URL(fallbackUri);

    if (candidate.origin === fallback.origin) {
      return candidate.toString();
    }
  } catch {
    return fallbackUri;
  }

  return fallbackUri;
}

export async function startLoginFlow(originalUri?: string) {
  const env = getEnv();
  const redirectUri = new URL("/auth/callback", env.APP_URL).toString();
  const wixClient = createHeadlessWixClient();
  const oauthData = wixClient.auth.generateOAuthData(
    redirectUri,
    sanitiseOriginalUri(originalUri, env.APP_URL)
  );
  const { authUrl } = await wixClient.auth.getAuthUrl(oauthData, {
    prompt: "login",
    responseMode: "fragment"
  });

  return {
    redirectUrl: authUrl,
    oauthState: createOauthStateRecord(oauthData) satisfies GridOAuthState
  };
}

export async function exchangeCodeForSession(input: {
  code: string;
  state: string;
  oauthState: GridOAuthState | null;
}) {
  if (!input.oauthState || input.oauthState.state !== input.state) {
    throw new AppError("Sign-in state is invalid or expired. Start login again.", 401);
  }

  const wixClient = createHeadlessWixClient();
  const tokens = await wixClient.auth.getMemberTokens(
    input.code,
    input.state,
    toOauthData(input.oauthState)
  );
  const member = await getAuthenticatedMember(tokens);

  return {
    memberId: member.memberId,
    contactId: member.contactId,
    email: member.email,
    username: resolveUsername(member),
    ...tokensToSessionFields(tokens),
    createdAt: new Date().toISOString()
  } satisfies GridSession;
}

export async function refreshSessionIfNeeded(session: GridSession) {
  const expiresAt = new Date(session.accessTokenExpiresAt).getTime();
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

  if (expiresAt > fiveMinutesFromNow) {
    return {
      session,
      refreshed: false
    };
  }

  const sdkTokens = sessionToSdkTokens(session);
  const wixClient = createHeadlessWixClient(sdkTokens);
  const refreshedTokens = await wixClient.auth.renewToken({
    value: session.refreshToken,
    role: sdkTokens.refreshToken.role
  });

  return {
    refreshed: true,
    session: {
      ...session,
      ...tokensToSessionFields(refreshedTokens)
    } satisfies GridSession
  };
}
