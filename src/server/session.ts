import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { EncryptJWT, jwtDecrypt }    from "jose";
import { getEnv }                    from "@/server/env";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mirrors the SDK's TokenRole enum as string literals. */
export type GridRefreshTokenRole = "visitor" | "member" | "none";

/**
 * Encrypted payload stored in the httpOnly session cookie.
 * Contains member identity and the Wix OAuth token pair.
 */
export interface GridSession {
  memberId:             string;
  contactId:            string | null;
  email:                string;
  username:             string;
  accessToken:          string;
  refreshToken:         string;
  refreshTokenRole:     GridRefreshTokenRole;
  accessTokenExpiresAt: string;   // ISO-8601
  createdAt:            string;   // ISO-8601
}

/**
 * Encrypted payload stored in the short-lived httpOnly OAuth-state cookie.
 *
 * Contains every field of the Wix SDK's `OauthData` interface so the full
 * object can be reconstructed at the /api/auth/exchange callback step for
 * PKCE verification — without relying on any in-process memory store.
 */
export interface GridOAuthState {
  state:         string;
  codeChallenge: string;
  codeVerifier:  string;   // PKCE secret — MUST stay server-side
  redirectUri:   string;
  originalUri:   string;
  createdAt:     string;   // ISO-8601
}

// ─── Cookie option builder ────────────────────────────────────────────────────

type SameSite = "lax" | "strict" | "none";

interface CookieOptions {
  httpOnly: true;
  secure:   boolean;
  sameSite: SameSite;
  path:     string;
  maxAge:   number;
  domain?:  string;
}

function cookieOpts(maxAge: number): CookieOptions {
  const env = getEnv();
  return {
    httpOnly: true,
    secure:   env.APP_URL.startsWith("https://"),
    sameSite: env.COOKIE_SAME_SITE as SameSite,
    path:     "/",
    maxAge,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

// ─── Crypto helpers (JWE AES-256-GCM) ────────────────────────────────────────

function secret(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

async function encryptJwt(
  payload:   Record<string, unknown>,
  expiresIn: string,
): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .encrypt(secret());
}

async function decryptJwt<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(token, secret(), { clockTolerance: 60 });
    return payload as T;
  } catch (e) {
    if (
      e instanceof Error &&
      !e.message.includes("expired") &&
      !e.message.includes("JWEDecryptionFailed")
    ) {
      console.warn("[GRID_SESSION] Unexpected decrypt error:", e.message);
    }
    return null;
  }
}

// ─── Session cookie ───────────────────────────────────────────────────────────

/** Encrypts the session and writes it as a 7-day httpOnly cookie. */
export async function setSessionCookie(
  response: NextResponse,
  session:  GridSession,
): Promise<void> {
  const token = await encryptJwt(
    session as unknown as Record<string, unknown>,
    "7d",
  );
  response.cookies.set(
    getEnv().SESSION_COOKIE_NAME,
    token,
    cookieOpts(60 * 60 * 24 * 7),
  );
}

/** Decrypts and returns the GridSession from the request cookie, or null. */
export async function readSessionCookie(
  request: NextRequest,
): Promise<GridSession | null> {
  const value = request.cookies.get(getEnv().SESSION_COOKIE_NAME)?.value;
  if (!value) return null;
  return decryptJwt<GridSession>(value);
}

/** Clears the session cookie. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(
    getEnv().SESSION_COOKIE_NAME,
    "",
    { ...cookieOpts(0), maxAge: 0 },
  );
}

// ─── OAuth state cookie ───────────────────────────────────────────────────────

/** Encrypts the OauthData and writes it as a 10-minute httpOnly cookie. */
export async function setOauthCookie(
  response: NextResponse,
  state:    GridOAuthState,
): Promise<void> {
  const token = await encryptJwt(
    state as unknown as Record<string, unknown>,
    "10m",
  );
  response.cookies.set(
    getEnv().OAUTH_COOKIE_NAME,
    token,
    cookieOpts(60 * 10),
  );
}

/** Decrypts and returns the GridOAuthState from the request cookie, or null. */
export async function readOauthCookie(
  request: NextRequest,
): Promise<GridOAuthState | null> {
  const value = request.cookies.get(getEnv().OAUTH_COOKIE_NAME)?.value;
  if (!value) return null;
  return decryptJwt<GridOAuthState>(value);
}

/** Clears the OAuth state cookie. */
export function clearOauthCookie(response: NextResponse): void {
  response.cookies.set(
    getEnv().OAUTH_COOKIE_NAME,
    "",
    { ...cookieOpts(0), maxAge: 0 },
  );
}