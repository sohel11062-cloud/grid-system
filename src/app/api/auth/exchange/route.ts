export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { exchangeCodeForSession } from "@/server/auth-service";
import {
  applyCors,
  handleRouteError,
  optionsResponse,
  successResponse,
} from "@/server/http";
import { AppError, ErrorCode } from "@/server/errors";
import { clearOauthCookie, readOauthCookie, setSessionCookie } from "@/server/session";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new AppError("Request body must be valid JSON.", 400, ErrorCode.VALIDATION_ERROR);
    }

    const body  = rawBody as Record<string, unknown>;
    const code  = typeof body.code  === "string" ? body.code.trim()  : undefined;
    const state = typeof body.state === "string" ? body.state.trim() : undefined;

    if (!code || !state) {
      throw new AppError(
        "Missing required parameters: code and state.",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    const oauthState = await readOauthCookie(request);
    const session    = await exchangeCodeForSession({ code, state, oauthState });

    const response = successResponse(
      {
        memberId: session.memberId,
        returnTo: oauthState?.originalUri || "/",
      },
      200,
      request
    );

    await setSessionCookie(response, session);
    clearOauthCookie(response);
    return response;

  } catch (error) {
    return handleRouteError(error, request);
  }
}