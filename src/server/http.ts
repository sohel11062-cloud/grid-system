import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { toAppError, ErrorCode } from "@/server/errors";
import type { RateLimitResult } from "@/server/rate-limiter";

// ─── CORS ────────────────────────────────────────────────────────────────────

export function applyCors(response: NextResponse, request: NextRequest): NextResponse {
  const env     = getEnv();
  const origin  = request.headers.get("origin");
  const allowed = env.ALLOWED_ORIGIN ?? new URL(env.APP_URL).origin;

  if (origin && origin === allowed) {
    response.headers.set("Access-Control-Allow-Origin",  origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export function optionsResponse(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return applyCors(response, request);
}

// ─── Security headers (applied to every response) ────────────────────────────

export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options",            "nosniff");
  response.headers.set("X-Frame-Options",                   "DENY");
  response.headers.set("X-XSS-Protection",                  "1; mode=block");
  response.headers.set("Referrer-Policy",                    "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy",                 "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"
  );
  return response;
}

// ─── Standardized JSON responses ─────────────────────────────────────────────

/**
 * Every API success response shape:
 * { success: true, ...payload }
 */
export function successResponse(
  data:    Record<string, unknown>,
  status = 200,
  request?: NextRequest
): NextResponse {
  const response = NextResponse.json({ success: true, ...data }, { status });
  applySecurityHeaders(response);
  if (request) applyCors(response, request);
  return response;
}

/**
 * Every API error response shape:
 * { success: false, error: "message", code: "ERROR_CODE" }
 */
export function handleRouteError(
  error:    unknown,
  request?: NextRequest
): NextResponse {
  const appErr = toAppError(error);

  // Only log 5xx – 4xx are expected client errors
  if (appErr.status >= 500) {
    console.error("[THE_GRID_ROUTE_ERROR]", {
      message: appErr.message,
      code:    appErr.code,
      status:  appErr.status,
      // Never log details that may contain secrets
    });
  }

  const response = NextResponse.json(
    {
      success: false,
      error:   appErr.message,
      code:    appErr.code,
    },
    { status: appErr.status }
  );

  applySecurityHeaders(response);
  if (request) applyCors(response, request);
  return response;
}

// ─── Rate limit response ──────────────────────────────────────────────────────

export function rateLimitResponse(
  result:   RateLimitResult,
  request?: NextRequest
): NextResponse {
  const retryAfterSec = Math.ceil((result.resetAtMs - Date.now()) / 1000);

  const response = NextResponse.json(
    {
      success: false,
      error:   "Too many requests. Please slow down.",
      code:    ErrorCode.RATE_LIMITED,
    },
    { status: 429 }
  );

  response.headers.set("Retry-After", String(Math.max(retryAfterSec, 1)));
  response.headers.set("X-RateLimit-Remaining", "0");
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAtMs / 1000)));

  applySecurityHeaders(response);
  if (request) applyCors(response, request);
  return response;
}