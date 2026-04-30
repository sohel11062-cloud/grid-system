import { NextRequest, NextResponse } from "next/server";

import { getDashboardForMember } from "@/server/grid-service";
import { applyCors, handleRouteError, optionsResponse } from "@/server/http";
import { persistSessionIfRefreshed, requireSession } from "@/server/require-session";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const authState = await requireSession(request);
    const dashboard = await getDashboardForMember(authState.session.memberId, true);
    const response = NextResponse.json({
      ok: true,
      message: "Ledger resynced from Wix.",
      dashboard
    });

    await persistSessionIfRefreshed(response, authState);
    return applyCors(response, request);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
