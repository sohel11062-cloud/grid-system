export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { getLeaderboardPage } from "@/server/leaderboard-service";

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(
      request.nextUrl.searchParams.get("pageSize") ??
      request.nextUrl.searchParams.get("limit") ??
      "25",
    );
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const board = await getLeaderboardPage({ page, pageSize, refresh });

    return successResponse({ leaderboard: board }, 200, request);
  } catch (error) { return handleRouteError(error, request); }
}
