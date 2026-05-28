import "server-only";

import { randomUUID } from "crypto";

import type {
  CreditTransactionSource,
  CreditTransactionType,
} from "@/lib/grid";

import { getRepository } from "@/server/storage/repository";
import { writeAuditLog } from "@/server/audit-service";

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Event Types
// ─────────────────────────────────────────────────────────────────────────────

type LedgerMetadata =
  Record<string, unknown>;

interface RecordLedgerEventInput {
  memberId: string;

  type: CreditTransactionType;

  amount: number;

  balanceAfter: number;

  source: CreditTransactionSource;

  referenceId: string;

  description?: string;

  metadata?: LedgerMetadata;

  correlationId?: string;

  idempotencyKey?: string;

  allowDuplicates?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Direction Rules
// ─────────────────────────────────────────────────────────────────────────────

const NEGATIVE_TRANSACTION_TYPES =
  new Set<CreditTransactionType>([
    "REDEEM",
  ]);

const POSITIVE_TRANSACTION_TYPES =
  new Set<CreditTransactionType>([
    "EARN",
    "BONUS",
  ]);

// ─────────────────────────────────────────────────────────────────────────────
// Amount Normalization
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTransactionAmount(
  type: CreditTransactionType,
  amount: number,
): number {

  const rounded =
    Math.round(amount);

  if (
    NEGATIVE_TRANSACTION_TYPES.has(type)
  ) {
    return -Math.abs(rounded);
  }

  if (
    POSITIVE_TRANSACTION_TYPES.has(type)
  ) {
    return Math.abs(rounded);
  }

  return rounded;
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate Protection
// ─────────────────────────────────────────────────────────────────────────────

async function transactionExists(
  memberId: string,
  type: CreditTransactionType,
  referenceId: string,
): Promise<boolean> {

  try {

    const repo =
      getRepository();

    const existing =
      await repo.listCreditTransactions(
        memberId,
        {
          limit: 5000,
        },
      );

    return existing.some(
      (tx) =>
        tx.type === type &&
        tx.referenceId === referenceId,
    );

  } catch (error) {

    console.error(
      "[GRID_LEDGER] Duplicate detection failed:",
      error,
    );

    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Ledger Recorder
// ─────────────────────────────────────────────────────────────────────────────

async function recordLedgerEvent({
  memberId,
  type,
  amount,
  balanceAfter,
  source,
  referenceId,
  description,
  metadata,
  correlationId,
  idempotencyKey,
  allowDuplicates = false,
}: RecordLedgerEventInput): Promise<void> {

  try {

    const repo =
      getRepository();

    // ─────────────────────────────────────────────────────────────────────────
    // Duplicate Protection
    // ─────────────────────────────────────────────────────────────────────────

    if (!allowDuplicates) {

      const exists =
        await transactionExists(
          memberId,
          type,
          referenceId,
        );

      if (exists) {

        console.warn(
          "[GRID_LEDGER] Duplicate transaction prevented:",
          {
            memberId,
            type,
            referenceId,
          },
        );

        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Normalize Amount
    // ─────────────────────────────────────────────────────────────────────────

    const normalizedAmount =
      normalizeTransactionAmount(
        type,
        amount,
      );

    // ─────────────────────────────────────────────────────────────────────────
    // Persist Immutable Ledger Event
    // ─────────────────────────────────────────────────────────────────────────

    await repo.saveCreditTransaction({
      id:
        randomUUID(),

      memberId,

      type,

      amount:
        normalizedAmount,

      balanceAfter:
        Math.round(balanceAfter),

      source,

      referenceId,

      description,

      metadata: {
        ...metadata,

        correlationId,

        idempotencyKey,

        recordedAt:
          new Date().toISOString(),
      },

      createdAt:
        new Date().toISOString(),
    });

  } catch (error) {

    // ─────────────────────────────────────────────────────────────────────────
    // Ledger failures must NEVER crash business flows
    // ─────────────────────────────────────────────────────────────────────────

    console.error(
      "[GRID_LEDGER] Failed to persist ledger event:",
      {
        memberId,
        type,
        source,
        referenceId,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Audit Log
    // ─────────────────────────────────────────────────────────────────────────

    try {

      await writeAuditLog({
        action:
          "LEDGER_WRITE_FAILURE",

        severity:
          "ERROR",

        message:
          "Failed to persist immutable ledger transaction.",

        memberId,

        metadata: {
          type,
          source,
          referenceId,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      });

    } catch {

      // Never allow audit failure to cascade
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Ledger Service
// ─────────────────────────────────────────────────────────────────────────────

export const ledgerService = {

  // ───────────────────────────────────────────────────────────────────────────
  // Order Earnings
  // ───────────────────────────────────────────────────────────────────────────

  async recordEarnFromOrder(
    memberId: string,
    credsEarned: number,
    balanceAfter: number,
    orderId: string,
    metadata?: LedgerMetadata,
  ): Promise<void> {

    return recordLedgerEvent({
      memberId,

      type:
        "EARN",

      amount:
        credsEarned,

      balanceAfter,

      source:
        "ORDER",

      referenceId:
        orderId,

      description:
        `Earned ${credsEarned} Creds from order ${orderId}`,

      metadata,
    });
  },

  // ───────────────────────────────────────────────────────────────────────────
  // System Bonuses
  // ───────────────────────────────────────────────────────────────────────────

  async recordBonus(
    memberId: string,
    amount: number,
    balanceAfter: number,
    bonusType:
      | "WELCOME_BONUS"
      | `BIRTHDAY_${number}`,

    metadata?: LedgerMetadata,
  ): Promise<void> {

    return recordLedgerEvent({
      memberId,

      type:
        "BONUS",

      amount,

      balanceAfter,

      source:
        "SYSTEM",

      referenceId:
        bonusType,

      description:
        `Bonus Cred allocation: ${bonusType}`,

      metadata,
    });
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Coupon Redemption
  // ───────────────────────────────────────────────────────────────────────────

  async recordRedemption(
    memberId: string,
    credsSpent: number,
    balanceAfter: number,
    couponCode: string,
    wixCouponId: string,
    metadata?: LedgerMetadata,
  ): Promise<void> {

    return recordLedgerEvent({
      memberId,

      type:
        "REDEEM",

      amount:
        credsSpent,

      balanceAfter,

      source:
        "COUPON",

      referenceId:
        couponCode,

      description:
        `Redeemed ${credsSpent} Creds for reward coupon ${couponCode}`,

      metadata: {
        ...metadata,

        couponCode,

        wixCouponId,
      },
    });
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Manual Admin Adjustments
  // ───────────────────────────────────────────────────────────────────────────

  async recordAdjustment(
    memberId: string,
    amount: number,
    balanceAfter: number,
    referenceId: string,
    description: string,
    metadata?: LedgerMetadata,
  ): Promise<void> {

    return recordLedgerEvent({
      memberId,

      type:
        "ADJUSTMENT",

      amount,

      balanceAfter,

      source:
        "ADMIN",

      referenceId,

      description,

      metadata,
    });
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Reversal Transactions
  // ───────────────────────────────────────────────────────────────────────────

  async recordReversal(
    memberId: string,
    amount: number,
    balanceAfter: number,
    originalReferenceId: string,
    reason: string,
    metadata?: LedgerMetadata,
  ): Promise<void> {

    return recordLedgerEvent({
      memberId,

      type:
        "ADJUSTMENT",

      amount,

      balanceAfter,

      source:
        "SYSTEM",

      referenceId:
        `REVERSAL_${originalReferenceId}`,

      description:
        `Ledger reversal: ${reason}`,

      metadata: {
        ...metadata,

        reversalOf:
          originalReferenceId,
      },

      allowDuplicates:
        true,
    });
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Recovery / Compensation Transactions
  // ───────────────────────────────────────────────────────────────────────────

  async recordRecovery(
    memberId: string,
    amount: number,
    balanceAfter: number,
    referenceId: string,
    reason: string,
    metadata?: LedgerMetadata,
  ): Promise<void> {

    return recordLedgerEvent({
      memberId,

      type:
        "ADJUSTMENT",

      amount,

      balanceAfter,

      source:
        "SYSTEM",

      referenceId,

      description:
        `Recovery operation: ${reason}`,

      metadata,
    });
  },
};
