export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { exchangeCodeForSession } from "@/server/auth-service";
import { AppError, ErrorCode } from "@/server/errors";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { clearOauthCookie, readOauthCookie, setSessionCookie } from "@/server/session";

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { throw new AppError("Invalid JSON body.", 400, ErrorCode.VALIDATION_ERROR); }

    const code  = typeof body.code  === "string" ? body.code.trim()  : "";
    const state = typeof body.state === "string" ? body.state.trim() : "";
    if (!code || !state)
      throw new AppError("Missing code or state.", 400, ErrorCode.VALIDATION_ERROR);

    const oauthState = await readOauthCookie(request);
    const session    = await exchangeCodeForSession({ code, state, oauthState });
    const response   = successResponse(
      { memberId: session.memberId, returnTo: oauthState?.originalUri ?? "/" },
      200, request
    );
    await setSessionCookie(response, session);
    clearOauthCookie(response);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
