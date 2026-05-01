export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getDashboardForMember } from "@/server/grid-service";
import {
  applyCors,
  handleRouteError,
  optionsResponse,
  successResponse,
} from "@/server/http";
import { persistSessionIfRefreshed, requireSession } from "@/server/require-session";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const authState  = await requireSession(request);
    const dashboard  = await getDashboardForMember(authState.session.memberId);
    const response   = successResponse({ ...dashboard }, 200, request);
    await persistSessionIfRefreshed(response, authState);
    return response;
  } catch (error) {
    return handleRouteError(error, request);
  }
}