import "server-only";

import { createHash, randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import type { AuditLog, AuditSeverity } from "@/lib/grid";
import { getRepository } from "@/server/storage/repository";

function hashIp(value: string | null): string | undefined {
  if (!value) return undefined;
  return createHash("sha256").update(value).digest("hex");
}

export async function writeAuditLog(input: {
  action: string;
  message: string;
  severity?: AuditSeverity;
  actorMemberId?: string;
  actorEmail?: string;
  memberId?: string;
  request?: NextRequest;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const request = input.request;
  const log: AuditLog = {
    id: randomUUID(),
    action: input.action,
    severity: input.severity ?? "INFO",
    message: input.message,
    actorMemberId: input.actorMemberId,
    actorEmail: input.actorEmail,
    memberId: input.memberId,
    requestId: request?.headers.get("x-request-id") ?? undefined,
    ipHash: hashIp(
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request?.headers.get("x-real-ip") ??
      null,
    ),
    userAgent: request?.headers.get("user-agent") ?? undefined,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };

  try {
    await getRepository().saveAuditLog(log);
  } catch (error) {
    console.error("[GRID_AUDIT] Failed to persist audit log:", {
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
