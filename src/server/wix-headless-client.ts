import "server-only";

import { createHash, randomBytes } from "crypto";
import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { MSG } from "@/server/brand";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WixTokenResponse {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  expires_in:    number;
}

export interface WixMemberInfo {
  id:          string;
  loginEmail?: string;
  contactId?:  string;
  profile?:    { nickname?: string };
  contact?:    { firstName?: string; lastName?: string };
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier  = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

// ─── Auth URLs ────────────────────────────────────────────────────────────────

export function buildLoginUrl(params: {
  state:         string;
  codeChallenge: string;
  redirectUri:   string;
}): string {
  const env = getEnv();
  const url = new URL("https://www.wix.com/oauth/access");
  url.searchParams.set("client_id",              env.WIX_CLIENT_ID);
  url.searchParams.set("response_type",          "code");
  url.searchParams.set("redirect_uri",           params.redirectUri);
  url.searchParams.set("scope",                  "offline_access");
  url.searchParams.set("state",                  params.state);
  url.searchParams.set("code_challenge",         params.codeChallenge);
  url.searchParams.set("code_challenge_method",  "S256");
  return url.toString();
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(params: {
  code:         string;
  codeVerifier: string;
  redirectUri:  string;
}): Promise<WixTokenResponse> {
  const env = getEnv();

  const body = new URLSearchParams({
    grant_type:    "authorization_code",
    client_id:     env.WIX_CLIENT_ID,
    code:          params.code,
    redirect_uri:  params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch("https://www.wix.com/oauth/access", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
      signal:  controller.signal,
    });
  } catch (e) {
    throw new AppError(MSG.INTERNAL_ERROR, 503, ErrorCode.WIX_API_ERROR);
  } finally {
    clearTimeout(tid);
  }

  const json = await response.json().catch(() => ({})) as Record<string, unknown>;

  if (!response.ok) {
    console.error("[GRID_AUTH] Token exchange failed:", { status: response.status, body: json });
    throw new AppError(MSG.INTERNAL_ERROR, response.status, ErrorCode.WIX_API_ERROR);
  }

  return json as unknown as WixTokenResponse;
}

// ─── Token refresh ────────────────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<WixTokenResponse> {
  const env  = getEnv();
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    client_id:     env.WIX_CLIENT_ID,
    refresh_token: refreshToken,
  });

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch("https://www.wix.com/oauth/access", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
      signal:  controller.signal,
    });
  } catch {
    throw new AppError(MSG.INTERNAL_ERROR, 503, ErrorCode.WIX_API_ERROR);
  } finally {
    clearTimeout(tid);
  }

  const json = await response.json().catch(() => ({})) as Record<string, unknown>;

  if (!response.ok) {
    console.error("[GRID_AUTH] Token refresh failed:", { status: response.status });
    throw new AppError(MSG.SESSION_EXPIRED, 401, ErrorCode.SESSION_EXPIRED);
  }

  return json as unknown as WixTokenResponse;
}

// ─── Get authenticated member via member's own access token ──────────────────

export async function getAuthenticatedMember(accessToken: string): Promise<WixMemberInfo> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(
      "https://www.wixapis.com/members/v1/members/my",
      {
        method:  "GET",
        headers: {
          "Authorization": accessToken,
          "Content-Type":  "application/json",
        },
        signal: controller.signal,
      }
    );
  } catch {
    throw new AppError(MSG.INTERNAL_ERROR, 503, ErrorCode.WIX_API_ERROR);
  } finally {
    clearTimeout(tid);
  }

  const json = await response.json().catch(() => ({})) as Record<string, unknown>;

  if (!response.ok) {
    console.error("[GRID_AUTH] Get member failed:", { status: response.status });
    throw new AppError(MSG.AUTH_REQUIRED, 401, ErrorCode.AUTH_REQUIRED);
  }

  const member = (json.member ?? json) as WixMemberInfo;
  if (!member?.id) {
    throw new AppError(MSG.INTERNAL_ERROR, 500, ErrorCode.WIX_API_ERROR);
  }
  return member;
}
