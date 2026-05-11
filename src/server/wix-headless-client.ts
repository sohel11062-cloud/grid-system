import "server-only";

import {
  createClient,
  OAuthStrategy,
  TokenRole,
  type OauthData,
  type Tokens,
} from "@wix/sdk";

import { contacts } from "@wix/crm";
import { members } from "@wix/members";
import { products } from "@wix/stores";

import { AppError, ErrorCode } from "@/server/errors";
import { MSG } from "@/server/brand";
import { getEnv } from "@/server/env";

import type {
  GridOAuthState,
  GridRefreshTokenRole,
  GridSession,
} from "@/server/session";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WixTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface WixMemberInfo {
  id: string;
  loginEmail?: string;
  contactId?: string;
  profile?: {
    nickname?: string;
  };
  contact?: {
    firstName?: string;
    lastName?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Client Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createHeadlessWixClient(tokens?: Tokens) {
  const env = getEnv();

  return createClient({
    modules: {
      products,
      members,
      contacts,
    },

    auth: OAuthStrategy(
      tokens
        ? {
            clientId: env.WIX_CLIENT_ID,
            tokens,
          }
        : {
            clientId: env.WIX_CLIENT_ID,
          }
    ),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function generatePKCE(): {
  verifier: string;
  challenge: string;
} {
  return {
    verifier: "",
    challenge: "",
  };
}

export function generateState(): string {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth State Serialization
// ─────────────────────────────────────────────────────────────────────────────

export function createOauthStateRecord(data: OauthData): GridOAuthState {
  return {
    state: data.state,
    codeChallenge: data.codeChallenge,
    codeVerifier: data.codeVerifier,
    redirectUri: data.redirectUri,
    originalUri: data.originalUri,
    createdAt: new Date().toISOString(),
  };
}

export function toOauthData(state: GridOAuthState): OauthData {
  return {
    state: state.state,
    codeChallenge: state.codeChallenge,
    codeVerifier: state.codeVerifier,
    redirectUri: state.redirectUri,
    originalUri: state.originalUri,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Login URL (SDK-backed)
// ─────────────────────────────────────────────────────────────────────────────

let oauthStore = new Map<string, OauthData>();

export function buildLoginUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const client = createHeadlessWixClient();

  const oauthData = client.auth.generateOAuthData({
    redirectUri: params.redirectUri,
    originalUri: "/",
  });

  oauthStore.set(oauthData.state, oauthData);

  return client.auth.getAuthUrl(oauthData);
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Exchange (SDK-backed)
// ─────────────────────────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  state?: string;
}): Promise<WixTokenResponse> {
  try {
    const client = createHeadlessWixClient();

    const oauthData =
      (params.state && oauthStore.get(params.state)) || undefined;

    if (!oauthData) {
      throw new AppError(
        "OAuth state expired or missing.",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    const tokens = await client.auth.getMemberTokens(
      params.code,
      oauthData
    );

    return {
      access_token: tokens.accessToken.value,
      refresh_token: tokens.refreshToken.value,
      token_type: "Bearer",
      expires_in: Math.floor(
        (tokens.accessToken.expiresAt - Date.now()) / 1000
      ),
    };
  } catch (error) {
    console.error("[GRID_AUTH] Token exchange failed:", error);

    throw new AppError(
      MSG.INTERNAL_ERROR,
      401,
      ErrorCode.WIX_API_ERROR
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Refresh (SDK-backed)
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshAccessToken(
  refreshToken: string
): Promise<WixTokenResponse> {
  try {
    const client = createHeadlessWixClient({
      accessToken: {
        value: "",
        expiresAt: Date.now() + 1000,
      },

      refreshToken: {
        value: refreshToken,
        role: TokenRole.MEMBER,
      },
    });

    const tokens = await client.auth.refreshToken();

    return {
      access_token: tokens.accessToken.value,
      refresh_token: tokens.refreshToken.value,
      token_type: "Bearer",
      expires_in: Math.floor(
        (tokens.accessToken.expiresAt - Date.now()) / 1000
      ),
    };
  } catch (error) {
    console.error("[GRID_AUTH] Token refresh failed:", error);

    throw new AppError(
      MSG.SESSION_EXPIRED,
      401,
      ErrorCode.SESSION_EXPIRED
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Conversion
// ─────────────────────────────────────────────────────────────────────────────

function sdkRoleToGrid(role: TokenRole): GridRefreshTokenRole {
  switch (role) {
    case TokenRole.MEMBER:
      return "member";

    case TokenRole.VISITOR:
      return "visitor";

    default:
      return "none";
  }
}

function gridRoleToSdk(role: GridRefreshTokenRole): TokenRole {
  switch (role) {
    case "member":
      return TokenRole.MEMBER;

    case "visitor":
      return TokenRole.VISITOR;

    default:
      return TokenRole.NONE;
  }
}

export function tokensToSessionFields(tokens: Tokens) {
  return {
    accessToken: tokens.accessToken.value,

    refreshToken: tokens.refreshToken.value,

    refreshTokenRole: sdkRoleToGrid(
      tokens.refreshToken.role
    ),

    accessTokenExpiresAt: new Date(
      tokens.accessToken.expiresAt
    ).toISOString(),
  };
}

export function sessionToSdkTokens(
  session: GridSession
): Tokens {
  return {
    accessToken: {
      value: session.accessToken,
      expiresAt: new Date(
        session.accessTokenExpiresAt
      ).getTime(),
    },

    refreshToken: {
      value: session.refreshToken,
      role: gridRoleToSdk(
        session.refreshTokenRole
      ),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated Member
// ─────────────────────────────────────────────────────────────────────────────

export async function getAuthenticatedMember(
  accessToken: string
): Promise<WixMemberInfo> {
  try {
    const client = createHeadlessWixClient({
      accessToken: {
        value: accessToken,
        expiresAt: Date.now() + 3600_000,
      },

      refreshToken: {
        value: "",
        role: TokenRole.NONE,
      },
    });

    const res = await client.members.getCurrentMember({
      fieldsets: ["FULL"],
    });

    const m = res.member;

    if (!m?._id || !m.loginEmail) {
      throw new AppError(
        "Wix did not return a usable member identity.",
        401
      );
    }

    return {
      id: m._id,

      loginEmail: m.loginEmail,

      contactId: m.contactId ?? undefined,

      profile: {
        nickname: m.profile?.nickname ?? undefined,
      },

      contact: {
        firstName: m.contact?.firstName ?? undefined,
        lastName: m.contact?.lastName ?? undefined,
      },
    };
  } catch (error) {
    console.error("[GRID_AUTH] Get member failed:", error);

    throw new AppError(
      MSG.AUTH_REQUIRED,
      401,
      ErrorCode.AUTH_REQUIRED
    );
  }
}