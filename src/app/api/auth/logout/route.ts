export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  applyCors,
  handleRouteError,
  optionsResponse,
  successResponse,
} from "@/server/http";
import { clearOauthCookie, clearSessionCookie } from "@/server/session";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const response = successResponse({ message: "Logged out." }, 200, request);
    clearSessionCookie(response);
    clearOauthCookie(response);
    return response;
  } catch (error) {
    return handleRouteError(error, request);
  }
}