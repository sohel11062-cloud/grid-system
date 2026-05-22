import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { toAppError, ErrorCode }     from "@/server/errors";
import type { RateLimitResult }      from "@/server/rate-limiter";
import { getEnv }                    from "@/server/env";

// ─── CORS ─────────────────────────────────────────────────────────────────────

export function applyCors(
  response: NextResponse,
  request:  NextRequest,
): NextResponse {
  const origin = request.headers.get("origin");
  if (origin) {
    const { APP_URL, ALLOWED_ORIGIN } = getEnv();
    const allowed = new Set([APP_URL, ALLOWED_ORIGIN].filter(Boolean));
    if (!allowed.has(origin)) return response;
    response.headers.set("Access-Control-Allow-Origin",      origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Headers",     "Content-Type, Authorization, Idempotency-Key, X-Idempotency-Key");
    response.headers.set("Access-Control-Allow-Methods",     "GET, POST, PATCH, OPTIONS");
    response.headers.set("Vary",                             "Origin");
  }
  return response;
}

export function optionsResponse(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return applyCors(response, request);
}

// ─── Security headers ─────────────────────────────────────────────────────────

export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options",        "DENY");
  response.headers.set("X-XSS-Protection",       "1; mode=block");
  response.headers.set("Referrer-Policy",        "strict-origin-when-cross-origin");
  return response;
}

// ─── Success response ─────────────────────────────────────────────────────────

export function successResponse(
  data:     Record<string, unknown>,
  status    = 200,
  request?: NextRequest,
): NextResponse {
  const response = NextResponse.json({ success: true, ...data }, { status });
  applySecurityHeaders(response);
  if (request) applyCors(response, request);
  return response;
}

// ─── Error response ───────────────────────────────────────────────────────────

export function handleRouteError(
  error:    unknown,
  request?: NextRequest,
): NextResponse {
  const appErr = toAppError(error);

  if (appErr.status >= 500) {
    console.error("[GRID_ROUTE_ERROR]", {
      message: appErr.message,
      code:    appErr.code,
      status:  appErr.status,
    });
  }

  const response = NextResponse.json(
    { success: false, error: appErr.message, code: appErr.code },
    { status: appErr.status },
  );
  applySecurityHeaders(response);
  if (request) applyCors(response, request);
  return response;
}

// ─── Rate-limit response ──────────────────────────────────────────────────────

export function rateLimitResponse(
  result:   RateLimitResult,
  request?: NextRequest,
): NextResponse {
  const retryAfterSec = Math.ceil((result.resetAtMs - Date.now()) / 1_000);
  const response = NextResponse.json(
    {
      success: false,
      error:   "Too many requests. Please slow down.",
      code:    ErrorCode.RATE_LIMITED,
    },
    { status: 429 },
  );
  response.headers.set("Retry-After",           String(Math.max(retryAfterSec, 1)));
  response.headers.set("X-RateLimit-Remaining", "0");
  response.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(result.resetAtMs / 1_000)),
  );
  applySecurityHeaders(response);
  if (request) applyCors(response, request);
  return response;
}
