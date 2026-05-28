import "server-only";

import { randomUUID } from "crypto";
import {
  getGridTier,
  type AdminAction,
  type AdminActionType,
  type GridTierKey,
  type GridUserStatus,
  type OrderHistory,
} from "@/lib/grid";
import { AppError, ErrorCode } from "@/server/errors";
import { ledgerService } from "@/server/ledger-service";
import { getRepository } from "@/server/storage/repository";
import { writeAuditLog } from "@/server/audit-service";

interface AdminActor {
  memberId: string;
  email: string;
}

function requireIdempotency(idempotencyKey?: string): string {
  const key = idempotencyKey?.trim();
  if (!key || key.length < 12) {
    throw new AppError(
      "A strong idempotency key is required for admin mutations.",
      400,
      ErrorCode.IDEMPOTENCY_REQUIRED,
    );
  }
  return key;
}

async function saveAction(input: {
  actor: AdminActor;
  targetMemberId?: string;
  type: AdminActionType;
  amount?: number;
  reason: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ action: AdminAction; replayed: boolean }> {
  const repo = getRepository();
  const existing = await repo.getAdminActionByIdempotencyKey(
    input.actor.memberId,
    input.idempotencyKey,
  );
  if (existing) return { action: existing, replayed: true };

  const action: AdminAction = {
    id: randomUUID(),
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    targetMemberId: input.targetMemberId,
    type: input.type,
    amount: input.amount,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
  return { action: await repo.saveAdminAction(action), replayed: false };
}

export async function adjustCreds(input: {
  actor: AdminActor;
  memberId: string;
  amount: number;
  reason: string;
  idempotencyKey?: string;
}) {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new AppError("Adjustment amount must be a non-zero integer.", 400, ErrorCode.VALIDATION_ERROR);
  }
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  const { action, replayed } = await saveAction({
    actor: input.actor,
    targetMemberId: input.memberId,
    type: input.amount > 0 ? "ADD_CREDS" : "REMOVE_CREDS",
    amount: input.amount,
    reason: input.reason,
    idempotencyKey,
  });
  if (replayed) {
    return { action, ledger: await getRepository().getMemberLedger(input.memberId), replayed };
  }

  const now = new Date().toISOString();
  const ledger = await getRepository().atomicCreditAdjustment(input.memberId, input.amount, now);
  if (!ledger) {
    throw new AppError(
      "Unable to adjust Creds. The user may not exist or may have insufficient balance.",
      409,
      ErrorCode.VALIDATION_ERROR,
    );
  }
  await ledgerService.recordAdjustment(
    input.memberId,
    input.amount,
    ledger.availableCreds,
    action.id,
    `Admin Cred adjustment: ${input.reason}`,
    { actorMemberId: input.actor.memberId, direction: input.amount > 0 ? "ADD" : "REMOVE" },
  );
  await writeAuditLog({
    action: "ADMIN_CRED_ADJUSTMENT",
    message: "Admin adjusted member Cred balance.",
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    memberId: input.memberId,
    metadata: { amount: input.amount, reason: input.reason, actionId: action.id },
  });
  return { action, ledger, replayed };
}

export async function triggerBonusCampaign(input: {
  actor: AdminActor;
  amount: number;
  reason: string;
  campaignType?: "GLOBAL" | "TIER" | "EVENT";
  targetTiers?: GridTierKey[];
  eventKey?: string;
  idempotencyKey?: string;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new AppError("Campaign amount must be a positive integer.", 400, ErrorCode.VALIDATION_ERROR);
  }
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  const campaignType =
    input.campaignType ?? "GLOBAL";

  if (
    campaignType === "TIER" &&
    (!input.targetTiers || input.targetTiers.length === 0)
  ) {
    throw new AppError(
      "A target tier is required for tier campaigns.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const { action, replayed } = await saveAction({
    actor: input.actor,
    type: "BONUS_CAMPAIGN",
    amount: input.amount,
    reason: input.reason,
    idempotencyKey,
    metadata: {
      campaignType,
      targetTiers:
        input.targetTiers,
      eventKey:
        input.eventKey,
    },
  });
  if (replayed) return { action, updated: 0, replayed };

  const users = (
    await getRepository().listUsers({ status: "ACTIVE", limit: 10_000 })
  ).filter((user) => {
    if (campaignType !== "TIER") {
      return true;
    }

    return input.targetTiers?.includes(
      user.rankOverride ?? user.level,
    );
  });

  let updated = 0;
  for (const user of users) {
    const ledger = await getRepository().atomicCreditAdjustment(
      user.memberId,
      input.amount,
      new Date().toISOString(),
    );
    if (!ledger) continue;
    updated++;
    await ledgerService.recordAdjustment(
      user.memberId,
      input.amount,
      ledger.availableCreds,
      `${action.id}:${user.memberId}`,
      `Campaign bonus: ${input.reason}`,
      {
        campaignActionId: action.id,
        campaignType,
        targetTiers:
          input.targetTiers,
        eventKey:
          input.eventKey,
      },
    );
  }
  await writeAuditLog({
    action: "ADMIN_BONUS_CAMPAIGN",
    message: "Admin triggered a bonus campaign.",
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    metadata: {
      amount: input.amount,
      updated,
      actionId: action.id,
      campaignType,
      targetTiers:
        input.targetTiers,
      eventKey:
        input.eventKey,
    },
  });
  return { action, updated, replayed };
}

export async function createSeasonalEvent(input: {
  actor: AdminActor;
  eventKey: string;
  amount: number;
  startsAt: string;
  endsAt: string;
  reason: string;
  idempotencyKey?: string;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new AppError("Event amount must be a positive integer.", 400, ErrorCode.VALIDATION_ERROR);
  }
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  const { action, replayed } = await saveAction({
    actor: input.actor,
    type: "SEASONAL_EVENT",
    amount: input.amount,
    reason: input.reason,
    idempotencyKey,
    metadata: {
      eventKey: input.eventKey,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
  });
  if (replayed) return { action, updated: 0, replayed };

  const users = await getRepository().listUsers({ status: "ACTIVE", limit: 10_000 });
  let updated = 0;
  for (const user of users) {
    const ledger = await getRepository().atomicCreditAdjustment(
      user.memberId,
      input.amount,
      new Date().toISOString(),
    );
    if (!ledger) continue;
    updated++;
    await ledgerService.recordAdjustment(
      user.memberId,
      input.amount,
      ledger.availableCreds,
      `${action.id}:${user.memberId}`,
      `Seasonal event ${input.eventKey}: ${input.reason}`,
      { eventActionId: action.id, eventKey: input.eventKey },
    );
  }
  await writeAuditLog({
    action: "ADMIN_SEASONAL_EVENT",
    message: "Admin created a seasonal event bonus.",
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    metadata: {
      eventKey: input.eventKey,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      updated,
      actionId: action.id,
    },
  });
  return { action, updated, replayed };
}

export async function forceRank(input: {
  actor: AdminActor;
  memberId: string;
  level: GridTierKey | null;
  reason: string;
  idempotencyKey?: string;
}) {
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  const { action, replayed } = await saveAction({
    actor: input.actor,
    targetMemberId: input.memberId,
    type: "FORCE_RANK",
    reason: input.reason,
    idempotencyKey,
    metadata: { level: input.level },
  });
  if (replayed) {
    return { action, user: await getRepository().getUser(input.memberId), replayed };
  }

  const user = await getRepository().setRankOverride(
    input.memberId,
    input.level,
    input.reason,
    new Date().toISOString(),
  );
  if (!user) throw new AppError("User not found.", 404, ErrorCode.LEDGER_NOT_FOUND);
  await writeAuditLog({
    action: "ADMIN_FORCE_RANK",
    message: "Admin forced a rank override.",
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    memberId: input.memberId,
    metadata: { level: input.level, fallbackTier: getGridTier(user.lifetimeCreds).key },
  });
  return { action, user, replayed };
}

export async function moderateUser(input: {
  actor: AdminActor;
  memberId: string;
  status: GridUserStatus;
  reason: string;
  idempotencyKey?: string;
}) {
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  const { action, replayed } = await saveAction({
    actor: input.actor,
    targetMemberId: input.memberId,
    type: "MODERATE_USER",
    reason: input.reason,
    idempotencyKey,
    metadata: { status: input.status },
  });
  if (replayed) {
    return { action, user: await getRepository().getUser(input.memberId), replayed };
  }
  const user = await getRepository().updateUserStatus(input.memberId, input.status, {
    actorMemberId: input.actor.memberId,
    reason: input.reason,
    now: new Date().toISOString(),
  });
  if (!user) throw new AppError("User not found.", 404, ErrorCode.LEDGER_NOT_FOUND);
  await writeAuditLog({
    action: "ADMIN_MODERATE_USER",
    severity: input.status === "ACTIVE" ? "INFO" : "SECURITY",
    message: "Admin changed user moderation status.",
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    memberId: input.memberId,
    metadata: { status: input.status, reason: input.reason },
  });
  return { action, user, replayed };
}

export async function reconcileOrder(input: {
  actor: AdminActor;
  memberId: string;
  orderId: string;
  amount: number;
  currency: string;
  reason: string;
  idempotencyKey?: string;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new AppError("Order amount must be positive.", 400, ErrorCode.VALIDATION_ERROR);
  }
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  const credsEarned = Math.floor(input.amount);
  const { action, replayed } = await saveAction({
    actor: input.actor,
    targetMemberId: input.memberId,
    type: "RECONCILE_ORDER",
    amount: credsEarned,
    reason: input.reason,
    idempotencyKey,
    metadata: { orderId: input.orderId, amount: input.amount, currency: input.currency },
  });
  if (replayed) return { action, replayed };

  const now = new Date().toISOString();
  const order: OrderHistory = {
    orderId: input.orderId,
    memberId: input.memberId,
    amount: input.amount,
    currency: input.currency,
    credsEarned,
    createdAt: now,
    syncedAt: now,
  };
  await getRepository().saveOrderHistory(order);
  const ledger = await getRepository().atomicCreditAdjustment(input.memberId, credsEarned, now);
  if (ledger) {
    await ledgerService.recordAdjustment(
      input.memberId,
      credsEarned,
      ledger.availableCreds,
      action.id,
      `Manual order reconciliation: ${input.orderId}`,
      { orderId: input.orderId, actorMemberId: input.actor.memberId },
    );
  }
  await writeAuditLog({
    action: "ADMIN_RECONCILE_ORDER",
    message: "Admin manually reconciled an order.",
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    memberId: input.memberId,
    metadata: { orderId: input.orderId, amount: input.amount, credsEarned },
  });
  return { action, ledger, replayed };
}

export async function recoverRedemption(input: {
  actor: AdminActor;
  redemptionId: string;
  status: "ISSUED" | "FAILED" | "CANCELLED";
  note: string;
  idempotencyKey?: string;
}) {
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  const { action, replayed } = await saveAction({
    actor: input.actor,
    type: "REDEMPTION_RECOVERY",
    reason: input.note,
    idempotencyKey,
    metadata: { redemptionId: input.redemptionId, status: input.status },
  });
  if (replayed) return { action, redemption: null, replayed };

  const redemption = await getRepository().updateRedemption(input.redemptionId, {
    status: input.status,
    recoveryNote: input.note,
    updatedAt: new Date().toISOString(),
  });
  if (!redemption) throw new AppError("Redemption not found.", 404, ErrorCode.VALIDATION_ERROR);

  await writeAuditLog({
    action: "ADMIN_REDEMPTION_RECOVERY",
    severity: input.status === "ISSUED" ? "INFO" : "WARN",
    message: "Admin resolved a redemption recovery state.",
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    memberId: redemption.memberId,
    metadata: { redemptionId: input.redemptionId, status: input.status },
  });
  return { action, redemption, replayed };
}
