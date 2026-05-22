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
    const repo = getRepository();
    const [
      globalStats,
      users,
      flaggedUsers,
      redemptions,
      auditLogs,
      adminActions,
      syncJobs,
    ] = await Promise.all([
      repo.getGlobalStats(),
      repo.listUsers({ limit: 25 }),
      repo.listUsers({ fraudHold: true, limit: 25 }),
      repo.listRedemptions({ limit: 25 }),
      repo.listAuditLogs({ limit: 40 }),
      repo.listAdminActions({ limit: 25 }),
      repo.listSyncJobs({ limit: 10 }),
    ]);
    const response = successResponse({
      admin: {
        memberId: auth.user.memberId,
        email: auth.user.email,
        roles: auth.user.roles,
      },
      globalStats,
      users,
      flaggedUsers,
      redemptions,
      auditLogs,
      adminActions,
      syncJobs,
    }, 200, request);
    await persistSessionIfRefreshed(response, auth);
    return response;
  } catch (error) { return handleRouteError(error, request); }
}
