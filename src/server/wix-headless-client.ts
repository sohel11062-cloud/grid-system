import "server-only";

import {
  TokenRole,
  createClient,
  OAuthStrategy,
  type OauthData,
  type Tokens
} from "@wix/sdk";
import { contacts } from "@wix/crm";
import { members } from "@wix/members";
import { products } from "@wix/stores";

import { AppError } from "@/server/errors";
import type { GridOAuthState, GridRefreshTokenRole, GridSession } from "@/server/session";

function getWixClientId() {
  const clientId = process.env.WIX_CLIENT_ID;

  if (!clientId) {
    throw new AppError("WIX_CLIENT_ID is required for Wix Headless login.", 500);
  }

  return clientId;
}

export function createHeadlessWixClient(tokens?: Tokens) {
  const clientId = getWixClientId();

  return createClient({
    modules: { products, members, contacts },
    auth: OAuthStrategy(tokens ? { clientId, tokens } : { clientId })
  });
}

export function createOauthStateRecord(oauthData: OauthData): GridOAuthState {
  return {
    state: oauthData.state,
    codeChallenge: oauthData.codeChallenge,
    codeVerifier: oauthData.codeVerifier,
    redirectUri: oauthData.redirectUri,
    originalUri: oauthData.originalUri,
    createdAt: new Date().toISOString()
  };
}

export function toOauthData(oauthState: GridOAuthState): OauthData {
  return {
    state: oauthState.state,
    codeChallenge: oauthState.codeChallenge,
    codeVerifier: oauthState.codeVerifier,
    redirectUri: oauthState.redirectUri,
    originalUri: oauthState.originalUri
  };
}

function toRefreshTokenRole(role: TokenRole): GridRefreshTokenRole {
  if (role === TokenRole.MEMBER) {
    return "member";
  }

  if (role === TokenRole.VISITOR) {
    return "visitor";
  }

  return "none";
}

function toTokenRole(role: GridRefreshTokenRole): TokenRole {
  if (role === "member") {
    return TokenRole.MEMBER;
  }

  if (role === "visitor") {
    return TokenRole.VISITOR;
  }

  return TokenRole.NONE;
}

export function tokensToSessionFields(tokens: Tokens) {
  return {
    accessToken: tokens.accessToken.value,
    refreshToken: tokens.refreshToken.value,
    refreshTokenRole: toRefreshTokenRole(tokens.refreshToken.role),
    accessTokenExpiresAt: new Date(tokens.accessToken.expiresAt).toISOString()
  };
}

export function sessionToSdkTokens(session: GridSession): Tokens {
  return {
    accessToken: {
      value: session.accessToken,
      expiresAt: new Date(session.accessTokenExpiresAt).getTime()
    },
    refreshToken: {
      value: session.refreshToken,
      role: toTokenRole(session.refreshTokenRole)
    }
  };
}

export interface AuthenticatedGridMember {
  memberId: string;
  contactId: string | null;
  email: string;
  nickname: string | null;
  firstName: string | null;
  lastName: string | null;
}

export async function getAuthenticatedMember(tokens: Tokens): Promise<AuthenticatedGridMember> {
  const wixClient = createHeadlessWixClient(tokens);
  const response = await wixClient.members.getCurrentMember({
    fieldsets: ["FULL"]
  });
  const member = response.member;

  if (!member?._id || !member.loginEmail) {
    throw new AppError("Wix did not return a usable member identity.", 401, response);
  }

  return {
    memberId: member._id,
    contactId: member.contactId ?? null,
    email: member.loginEmail,
    nickname: member.profile?.nickname ?? null,
    firstName: member.contact?.firstName ?? null,
    lastName: member.contact?.lastName ?? null
  };
}
