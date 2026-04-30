import { NextRequest, NextResponse } from "next/server";

import { startLoginFlow } from "@/server/auth-service";
import { handleRouteError } from "@/server/http";
import { setOauthCookie } from "@/server/session";

export async function GET(request: NextRequest) {
  try {
    const returnTo = request.nextUrl.searchParams.get("returnTo") ?? undefined;
    const { redirectUrl, oauthState } = await startLoginFlow(returnTo);
    const response = NextResponse.redirect(redirectUrl);
    await setOauthCookie(response, oauthState);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
