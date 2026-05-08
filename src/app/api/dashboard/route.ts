export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getDashboardForMember } from "@/server/grid-service";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { persistSessionIfRefreshed, requireSession } from "@/server/require-session";

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function GET(request: NextRequest) {
  try {
    const auth      = await requireSession(request);
    const dashboard = await getDashboardForMember(auth.session.memberId);
    const response  = successResponse({ ...dashboard }, 200, request);
    await persistSessionIfRefreshed(response, auth);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
