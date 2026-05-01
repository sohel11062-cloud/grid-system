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

import { AppError } from "@/server/errors";
import type { GridOAuthState, GridRefreshTokenRole, GridSession } from "@/server/session";

// ─── Client factory ───────────────────────────────────────────────────────────

export function createHeadlessWixClient(tokens?: Tokens) {
  const clientId = process.env.WIX_CLIENT_ID;
  if (!clientId) throw new AppError("WIX_CLIENT_ID is not configured.", 500);

  return createClient({
    modules: { products, members, contacts },
    auth: OAuthStrategy(tokens ? { clientId, tokens } : { clientId }),
  });
}

// ─── OAuth state serialisation ────────────────────────────────────────────────

export function createOauthStateRecord(data: OauthData): GridOAuthState {
  return {
    state:          data.state,
    codeChallenge:  data.codeChallenge,
    codeVerifier:   data.codeVerifier,
    redirectUri:    data.redirectUri,
    originalUri:    data.originalUri,
    createdAt:      new Date().toISOString(),
  };
}

export function toOauthData(state: GridOAuthState): OauthData {
  return {
    state:         state.state,
    codeChallenge: state.codeChallenge,
    codeVerifier:  state.codeVerifier,
    redirectUri:   state.redirectUri,
    originalUri:   state.originalUri,
  };
}

// ─── Token conversion ─────────────────────────────────────────────────────────

function sdkRoleToGrid(role: TokenRole): GridRefreshTokenRole {
  switch (role) {
    case TokenRole.MEMBER:  return "member";
    case TokenRole.VISITOR: return "visitor";
    default:                return "none";
  }
}

function gridRoleToSdk(role: GridRefreshTokenRole): TokenRole {
  switch (role) {
    case "member":  return TokenRole.MEMBER;
    case "visitor": return TokenRole.VISITOR;
    default:        return TokenRole.NONE;
  }
}

export function tokensToSessionFields(tokens: Tokens) {
  return {
    accessToken:           tokens.accessToken.value,
    refreshToken:          tokens.refreshToken.value,
    refreshTokenRole:      sdkRoleToGrid(tokens.refreshToken.role),
    accessTokenExpiresAt:  new Date(tokens.accessToken.expiresAt).toISOString(),
  };
}

export function sessionToSdkTokens(session: GridSession): Tokens {
  return {
    accessToken: {
      value:     session.accessToken,
      expiresAt: new Date(session.accessTokenExpiresAt).getTime(),
    },
    refreshToken: {
      value: session.refreshToken,
      role:  gridRoleToSdk(session.refreshTokenRole),
    },
  };
}

// ─── Authenticated member identity ────────────────────────────────────────────

export interface AuthenticatedGridMember {
  memberId:   string;
  contactId:  string | null;
  email:      string;
  nickname:   string | null;
  firstName:  string | null;
  lastName:   string | null;
}

export async function getAuthenticatedMember(tokens: Tokens): Promise<AuthenticatedGridMember> {
  const client = createHeadlessWixClient(tokens);
  const res = await client.members.getCurrentMember({ fieldsets: ["FULL"] });
  const m = res.member;

  if (!m?._id || !m.loginEmail) {
    throw new AppError("Wix did not return a usable member identity.", 401, res);
  }

  return {
    memberId:  m._id,
    contactId: m.contactId ?? null,
    email:     m.loginEmail,
    nickname:  m.profile?.nickname ?? null,
    firstName: m.contact?.firstName ?? null,
    lastName:  m.contact?.lastName ?? null,
  };
}