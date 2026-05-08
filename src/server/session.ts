import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { EncryptJWT, jwtDecrypt } from "jose";
import { getEnv } from "@/server/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GridRefreshTokenRole = "visitor" | "member" | "none";

export interface GridSession {
  memberId:             string;
  contactId:            string | null;
  email:                string;
  username:             string;
  accessToken:          string;
  refreshToken:         string;
  refreshTokenRole:     GridRefreshTokenRole;
  accessTokenExpiresAt: string;
  createdAt:            string;
}

export interface GridOAuthState {
  state:         string;
  codeChallenge: string;
  codeVerifier:  string;
  redirectUri:   string;
  originalUri:   string;
  createdAt:     string;
}

// ─── Cookie options ───────────────────────────────────────────────────────────

function cookieOpts(maxAge: number) {
  const env      = getEnv();
  const isSecure = env.APP_URL.startsWith("https://");

  return {
    httpOnly: true,
    secure:   isSecure,
    sameSite: env.COOKIE_SAME_SITE as "lax" | "strict" | "none",
    path:     "/",
    maxAge,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

// ─── Crypto ───────────────────────────────────────────────────────────────────

function secret(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

async function encrypt(
  payload:   Record<string, unknown>,
  expiresIn: string
): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .encrypt(secret());
}

async function decrypt<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(token, secret(), { clockTolerance: 60 });
    return payload as T;
  } catch (e) {
    if (e instanceof Error && !e.message.includes("expired") && !e.message.includes("JWEDecryptionFailed")) {
      console.warn("[GRID_SESSION] Decrypt warn:", e.message);
    }
    return null;
  }
}

// ─── Session cookie ───────────────────────────────────────────────────────────

export async function setSessionCookie(
  response: NextResponse,
  session:  GridSession
): Promise<void> {
  const token = await encrypt(session as unknown as Record<string, unknown>, "7d");
  response.cookies.set(getEnv().SESSION_COOKIE_NAME, token, cookieOpts(60 * 60 * 24 * 7));
}

export async function readSessionCookie(
  request: NextRequest
): Promise<GridSession | null> {
  const value = request.cookies.get(getEnv().SESSION_COOKIE_NAME)?.value;
  if (!value) return null;
  return decrypt<GridSession>(value);
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(getEnv().SESSION_COOKIE_NAME, "", { ...cookieOpts(0), maxAge: 0 });
}

// ─── OAuth state cookie ───────────────────────────────────────────────────────

export async function setOauthCookie(
  response: NextResponse,
  state:    GridOAuthState
): Promise<void> {
  const token = await encrypt(state as unknown as Record<string, unknown>, "10m");
  response.cookies.set(getEnv().OAUTH_COOKIE_NAME, token, cookieOpts(60 * 10));
}

export async function readOauthCookie(
  request: NextRequest
): Promise<GridOAuthState | null> {
  const value = request.cookies.get(getEnv().OAUTH_COOKIE_NAME)?.value;
  if (!value) return null;
  return decrypt<GridOAuthState>(value);
}

export function clearOauthCookie(response: NextResponse): void {
  response.cookies.set(getEnv().OAUTH_COOKIE_NAME, "", { ...cookieOpts(0), maxAge: 0 });
}
