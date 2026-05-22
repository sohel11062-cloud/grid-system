export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/admin-auth";
import { handleRouteError, optionsResponse, successResponse } from "@/server/http";
import { persistSessionIfRefreshed } from "@/server/require-session";
import { getRepository } from "@/server/storage/repository";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  query: z.string().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(),
  role: z.enum(["member", "admin", "owner"]).optional(),
  fraudHold: z.enum(["true", "false"]).optional(),
});

export async function OPTIONS(req: NextRequest) { return optionsResponse(req); }

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const parsed = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const [users, total] = await Promise.all([
      getRepository().listUsers({
        limit: parsed.limit,
        skip: parsed.skip,
        query: parsed.query,
        status: parsed.status,
        role: parsed.role,
        fraudHold: parsed.fraudHold === undefined ? undefined : parsed.fraudHold === "true",
      }),
      getRepository().countUsers({
        status: parsed.status,
        fraudHold: parsed.fraudHold === undefined ? undefined : parsed.fraudHold === "true",
      }),
    ]);
    const response = successResponse({ users, total }, 200, request);
    await persistSessionIfRefreshed(response, auth);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
