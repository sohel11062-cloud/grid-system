import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { redeemMemberCreds } from "@/server/coupon-service";
import { applyCors, handleRouteError, optionsResponse } from "@/server/http";
import { persistSessionIfRefreshed, requireSession } from "@/server/require-session";

const redeemSchema = z.object({
  creds: z.coerce.number().int()
});

export async function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const authState = await requireSession(request);
    const body = redeemSchema.parse(await request.json());
    const result = await redeemMemberCreds(authState.session.memberId, body.creds);
    const response = NextResponse.json({
      ok: true,
      coupon: result.coupon,
      dashboard: result.dashboard
    });

    await persistSessionIfRefreshed(response, authState);
    return applyCors(response, request);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
