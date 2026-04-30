import { NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/server/env";
import { toAppError } from "@/server/errors";

export function applyCors(response: NextResponse, request: NextRequest) {
  const env = getEnv();
  const requestOrigin = request.headers.get("origin");
  const allowedOrigin = env.ALLOWED_ORIGIN ?? new URL(env.APP_URL).origin;

  if (requestOrigin && requestOrigin === allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", requestOrigin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export function optionsResponse(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  return applyCors(response, request);
}

export function handleRouteError(error: unknown, request?: NextRequest) {
  const appError = toAppError(error);

  if (appError.status >= 500) {
    console.error("[THE_GRID_ERROR]", error);
  }

  const response = NextResponse.json(
    {
      error: appError.message,
      details: appError.details ?? null
    },
    { status: appError.status }
  );

  return request ? applyCors(response, request) : response;
}
