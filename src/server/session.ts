import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { EncryptJWT, jwtDecrypt } from "jose";

import { getEnv } from "@/server/env";

export type GridRefreshTokenRole = "visitor" | "member" | "none";

export interface GridSession {
  memberId: string;
  contactId: string | null;
  email: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  refreshTokenRole: GridRefreshTokenRole;
  accessTokenExpiresAt: string;
  createdAt: string;
}

export interface GridOAuthState {
  state: string;
  codeChallenge: string;
  codeVerifier: string;
  redirectUri: string;
  originalUri: string;
  createdAt: string;
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_MAX_AGE_SECONDS = 60 * 10;
const encoder = new TextEncoder();

type GridCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
  domain?: string;
};

function getSecret() {
  return encoder.encode(getEnv().SESSION_SECRET);
}

function getCookieOptions(maxAge: number): GridCookieOptions {
  const env = getEnv();

  return {
    httpOnly: true,
    secure: env.APP_URL.startsWith("https://"),
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
    maxAge,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
  };
}

async function encryptPayload(payload: Record<string, unknown>, expiresIn: string) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .encrypt(getSecret());
}

async function decryptPayload<T>(value: string): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(value, getSecret());
    return payload as T;
  } catch {
    return null;
  }
}

export async function setSessionCookie(response: NextResponse, session: GridSession) {
  const token = await encryptPayload(session as unknown as Record<string, unknown>, "7d");
  response.cookies.set(getEnv().SESSION_COOKIE_NAME, token, getCookieOptions(SESSION_MAX_AGE_SECONDS));
}

export async function readSessionCookie(request: NextRequest) {
  const value = request.cookies.get(getEnv().SESSION_COOKIE_NAME)?.value;
  return value ? decryptPayload<GridSession>(value) : null;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(getEnv().SESSION_COOKIE_NAME, "", {
    ...getCookieOptions(0),
    maxAge: 0
  });
}

export async function setOauthCookie(response: NextResponse, state: GridOAuthState) {
  const token = await encryptPayload(state as unknown as Record<string, unknown>, "10m");
  response.cookies.set(getEnv().OAUTH_COOKIE_NAME, token, getCookieOptions(OAUTH_MAX_AGE_SECONDS));
}

export async function readOauthCookie(request: NextRequest) {
  const value = request.cookies.get(getEnv().OAUTH_COOKIE_NAME)?.value;
  return value ? decryptPayload<GridOAuthState>(value) : null;
}

export function clearOauthCookie(response: NextResponse) {
  response.cookies.set(getEnv().OAUTH_COOKIE_NAME, "", {
    ...getCookieOptions(0),
    maxAge: 0
  });
}
