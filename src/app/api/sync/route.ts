export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getDashboardForMember } from "@/server/grid-service";
import { handleRouteError, optionsResponse, rateLimitResponse, successResponse } from "@/server/http";
import { checkRateLimit } from "@/server/rate-limiter";
import { persistSessionIfRefreshed, requireSession } from "@/server/require-session";

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession(request);
    const memberId = auth.session.memberId;

    const rl = checkRateLimit(`sync:${memberId}`, 3, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, request);

    const dashboard = await getDashboardForMember(memberId, true);
    const response  = successResponse({ message: "Grid ledger synchronized.", dashboard }, 200, request);
    await persistSessionIfRefreshed(response, auth);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
