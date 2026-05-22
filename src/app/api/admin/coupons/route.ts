export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { requireAdmin } from "@/server/admin-auth";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { persistSessionIfRefreshed } from "@/server/require-session";
import { getRepository } from "@/server/storage/repository";

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const memberId = request.nextUrl.searchParams.get("memberId");
    if (!memberId) {
      const response = successResponse({ coupons: [] }, 200, request);
      await persistSessionIfRefreshed(response, auth);
      return response;
    }
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "100"), 250);
    const coupons = await getRepository().listCouponsByMember(memberId, limit);
    const summary = await getRepository().getCouponSummary(memberId);
    const response = successResponse({ coupons, summary }, 200, request);
    await persistSessionIfRefreshed(response, auth);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
