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
import type { GridOAuthState, GridRefreshTokenRole, GridSession } from "@/server/session";

// ─── Exported types ───────────────────────────────────────────────────────────

export interface WixMemberInfo {
  id:        string;
  loginEmail: string;
  contactId:  string | null;
  profile:    { nickname: string | null };
  contact:    { firstName: string | null; lastName: string | null };
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function createHeadlessWixClient(tokens?: Tokens) {
  const { WIX_CLIENT_ID } = getEnv();
  return createClient({
    modules: { products, members, contacts },
    auth:    OAuthStrategy(
      tokens
        ? { clientId: WIX_CLIENT_ID, tokens }
        : { clientId: WIX_CLIENT_ID }
    ),
  });
}

// ─── Login: generate OAuth data + Wix-managed login URL ──────────────────────

/**
 * Generates PKCE parameters (state, codeVerifier, codeChallenge) via the Wix SDK
 * and returns the Wix-managed login URL.
 *
 * IMPORTANT: The returned `oauthData` MUST be stored in a signed, httpOnly cookie
 * before redirecting the user. It contains the `codeVerifier` required for the
 * PKCE token exchange at the callback step.  Storing it in process memory would
 * break in any multi-instance or serverless (Vercel) deployment.
 */
export async function generateOAuthLoginData(
  redirectUri: string,
  originalUri: string
): Promise<{ oauthData: OauthData; loginUrl: string }> {

  try {

    const client =
      createHeadlessWixClient();

    const oauthData =
      client.auth.generateOAuthData(
        originalUri
      );

    oauthData.redirectUri =
      redirectUri;

    console.log(
      "[GRID_AUTH] redirectUri =",
      redirectUri
    );

    const { authUrl } =
      await client.auth.getAuthUrl(
        oauthData
      );

    // IMPORTANT:
    // Convert fragment → query
    // So Next.js can read code/state
    const loginUrl =
      authUrl.replace(
        "responseMode=fragment",
        "responseMode=query"
      );

    console.log(
      "[GRID_AUTH] loginUrl =",
      loginUrl
    );

    return {
      oauthData,
      loginUrl,
    };

  } catch (error) {

    console.error(
      "[GRID_AUTH] generateOAuthLoginData failed:",
      error
    );

    throw new AppError(
      MSG.INTERNAL_ERROR,
      500,
      ErrorCode.WIX_API_ERROR
    );
  }
}

// ─── Callback: exchange auth code → Wix member tokens ────────────────────────

export async function exchangeCodeForWixTokens(
  code: string,
  oauthState: GridOAuthState,
): Promise<Tokens> {

  const oauthData: OauthData = {
    state:
      oauthState.state,

    codeChallenge:
      oauthState.codeChallenge,

    codeVerifier:
      oauthState.codeVerifier,

    redirectUri:
      oauthState.redirectUri,

    originalUri:
      oauthState.originalUri,
  };

  try {

    const client =
      createHeadlessWixClient();

    // IMPORTANT:
    // New Wix SDK requires:
    // code, state, oauthData
    return await client.auth.getMemberTokens(
      code,
      oauthData.state,
      oauthData
    );

  } catch (error) {

    if (error instanceof AppError) {
      throw error;
    }

    console.error(
      "[GRID_AUTH] getMemberTokens failed:",
      error
    );

    throw new AppError(
      MSG.INTERNAL_ERROR,
      401,
      ErrorCode.WIX_API_ERROR
    );
  }
}

// ─── Refresh Wix tokens using the stored refresh token ───────────────────────

/**
 * Uses the stored refresh token to obtain a fresh access + refresh token pair.
 * The client is initialized with an already-expired access token so the SDK
 * is forced into refresh-only mode.
 */
export async function refreshWixTokens(
  refreshToken: string
): Promise<Tokens> {

  try {

    const client =
      createHeadlessWixClient({
        accessToken: {
          value: "",
          expiresAt: Date.now() - 1000,
        },

        refreshToken: {
          value: refreshToken,
          role: TokenRole.MEMBER,
        },
      });

    // New Wix SDK replacement flow
    const visitorTokens =
      await client.auth.generateVisitorTokens();

    return {
      accessToken:
        visitorTokens.accessToken,

      refreshToken: {
        value: refreshToken,
        role: TokenRole.MEMBER,
      },
    } as Tokens;

  } catch (error) {

    console.error(
      "[GRID_AUTH] refreshWixTokens failed:",
      error
    );

    throw new AppError(
      MSG.SESSION_EXPIRED,
      401,
      ErrorCode.SESSION_EXPIRED
    );
  }
}

// ─── Fetch the currently-authenticated member's profile ──────────────────────

export async function getAuthenticatedMember(tokens: Tokens): Promise<WixMemberInfo> {
  try {
    const client = createHeadlessWixClient(tokens);

    // "FULL" fieldset returns profile + contact details needed for username resolution.
    // `as const` ensures TypeScript infers "FULL" as a string literal, which satisfies
    // the SDK's enum-based fieldset type (e.g. MemberFieldSet | "FULL" | ...).
    const { member } = await client.members.getCurrentMember({
      fieldsets: ["FULL" as const],
    });

    if (!member) {
      throw new AppError(
        "Wix returned an empty member payload.",
        401,
        ErrorCode.AUTH_REQUIRED,
      );
    }

    // `_id` is the canonical field in the Members v1 API.
    // Capture before the guard so TypeScript can narrow the type.
    const id:         string | null | undefined = member._id;
    const loginEmail: string | null | undefined = member.loginEmail;

    if (!id || !loginEmail) {
      throw new AppError(
        "Wix did not return a usable member identity.",
        401,
        ErrorCode.AUTH_REQUIRED,
      );
    }

    return {
      id,
      loginEmail,
      contactId:  member.contactId          ?? null,
      profile:    { nickname:   member.profile?.nickname   ?? null },
      contact:    {
        firstName: member.contact?.firstName ?? null,
        lastName:  member.contact?.lastName  ?? null,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[GRID_AUTH] getCurrentMember failed:", error);
    throw new AppError(MSG.AUTH_REQUIRED, 401, ErrorCode.AUTH_REQUIRED);
  }
}

// ─── Token ↔ GridSession conversion helpers ───────────────────────────────────

export function tokensToSessionFields(tokens: Tokens): {
  accessToken:          string;
  refreshToken:         string;
  refreshTokenRole:     GridRefreshTokenRole;
  accessTokenExpiresAt: string;
} {

  return {
    accessToken:
      tokens.accessToken.value,

    refreshToken:
      tokens.refreshToken.value,

    // IMPORTANT:
    // New Wix SDK types role as string
    refreshTokenRole:
      sdkRoleToGrid(
        tokens.refreshToken.role as TokenRole
      ),

    accessTokenExpiresAt:
      new Date(
        tokens.accessToken.expiresAt
      ).toISOString(),
  };
}

export function sessionToSdkTokens(
  session: GridSession
): Tokens {

  return {
    accessToken: {
      value:
        session.accessToken,

      expiresAt:
        new Date(
          session.accessTokenExpiresAt
        ).getTime(),
    },

    refreshToken: {
      value:
        session.refreshToken,

      role:
        gridRoleToSdk(
          session.refreshTokenRole
        ),
    },
  } as Tokens;
}

// ─── Private role-conversion helpers ─────────────────────────────────────────

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