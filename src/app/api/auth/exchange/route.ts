import { NextRequest, NextResponse } from "next/server";

import { exchangeCodeForSession } from "@/server/auth-service";
import { applyCors, handleRouteError, optionsResponse } from "@/server/http";
import { clearOauthCookie, readOauthCookie, setSessionCookie } from "@/server/session";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const { code, state } = (await request.json()) as { code?: string; state?: string };

    if (!code || !state) {
      throw new Error("Missing login code or state.");
    }

    const oauthState = await readOauthCookie(request);
    const session = await exchangeCodeForSession({
      code,
      state,
      oauthState
    });

    const response = NextResponse.json({
      ok: true,
      memberId: session.memberId,
      returnTo: oauthState?.originalUri || "/"
    });
    await setSessionCookie(response, session);
    clearOauthCookie(response);
    return applyCors(response, request);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
