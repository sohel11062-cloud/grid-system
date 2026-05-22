import "server-only";

import type { NextRequest } from "next/server";
import { AppError, ErrorCode } from "@/server/errors";
import { requireSession } from "@/server/require-session";
import { hasAdminRole, hasOwnerRole } from "@/server/user-service";
import { writeAuditLog } from "@/server/audit-service";

export async function requireAdmin(
  request: NextRequest,
  minRole: "admin" | "owner" = "admin",
) {
  const auth = await requireSession(request);
  const allowed = minRole === "owner"
    ? hasOwnerRole(auth.user)
    : hasAdminRole(auth.user);

  if (!allowed || auth.user.status !== "ACTIVE") {
    await writeAuditLog({
      action: "ADMIN_ACCESS_DENIED",
      severity: "SECURITY",
      message: "Non-admin session attempted to access an admin route.",
      actorMemberId: auth.session.memberId,
      actorEmail: auth.session.email,
      request,
    });
    throw new AppError("Admin access required.", 403, ErrorCode.FORBIDDEN);
  }

  return auth;
}
