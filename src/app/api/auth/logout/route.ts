export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { clearOauthCookie, clearSessionCookie } from "@/server/session";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function POST(request: NextRequest) {
  try {
    const response = successResponse({ message: "Session ended." }, 200, request);
    clearSessionCookie(response);
    clearOauthCookie(response);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
