import "server-only";

import {
  getGridTier,
  type GridMemberLedger,
  type GridUser,
  type GridUserRole,
} from "@/lib/grid";
import { getEnv } from "@/server/env";
import type { GridSession } from "@/server/session";
import { getRepository } from "@/server/storage/repository";
import { writeAuditLog } from "@/server/audit-service";

function csvSet(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function bootstrapRolesForSession(session: GridSession): GridUserRole[] {
  const env = getEnv();
  const adminEmails = csvSet(env.ADMIN_EMAILS);
  const adminMemberIds = csvSet(env.ADMIN_MEMBER_IDS);
  const roles = new Set<GridUserRole>(["member"]);

  if (
    adminEmails.has(session.email.toLowerCase()) ||
    adminMemberIds.has(session.memberId.toLowerCase())
  ) {
    roles.add("admin");
    roles.add("owner");
  }

  return [...roles];
}

function emptyLedgerFromSession(session: GridSession, now: string): GridMemberLedger {
  const level = getGridTier(0).key;
  return {
    memberId: session.memberId,
    contactId: session.contactId,
    email: session.email,
    username: session.username,
    birthdayMonthDay: null,
    welcomeBonusGrantedAt: null,
    birthdayBonusYears: [],
    totalPurchaseValue: 0,
    purchaseCreds: 0,
    bonusCreds: 0,
    adjustmentCreds: 0,
    lifetimeCreds: 0,
    redeemedCreds: 0,
    availableCreds: 0,
    level,
    orderCount: 0,
    orders: [],
    achievements: [],
    fraudHold: false,
    fraudScore: 0,
    fraudSignals: [],
    createdAt: now,
    updatedAt: now,
    syncedAt: now,
  };
}

export async function ensureUserFromSession(
  session: GridSession,
): Promise<GridUser> {
  const repo = getRepository();
  const now = new Date().toISOString();
  const existing = await repo.getUser(session.memberId);
  const bootstrapRoles =
  bootstrapRolesForSession(session);

const roles =
  existing?.roles?.includes("owner")
    ? Array.from(
        new Set([
          ...existing.roles,
          ...bootstrapRoles,
        ])
      )
    : bootstrapRoles;

  const ledger = await repo.getMemberLedger(session.memberId) ??
    emptyLedgerFromSession(session, now);

  const user = await repo.upsertUserFromLedger(
    {
      ...ledger,
      contactId: session.contactId ?? ledger.contactId,
      email: session.email || ledger.email,
      username: session.username || ledger.username,
      updatedAt: now,
    },
    { roles, lastLoginAt: now },
  );

  if (!existing) {
    await writeAuditLog({
      action: "USER_CREATED",
      message: "Persistent GRID user created from authenticated Wix session.",
      memberId: session.memberId,
      actorMemberId: session.memberId,
      actorEmail: session.email,
    });
  }

  return user;
}

export function hasAdminRole(user: GridUser): boolean {
  return user.roles.includes("admin") || user.roles.includes("owner");
}

export function hasOwnerRole(user: GridUser): boolean {
  return user.roles.includes("owner");
}
