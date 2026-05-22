import "server-only";

import { randomUUID }              from "crypto";
import type {
  CreditTransactionSource,
  CreditTransactionType,
} from "@/lib/grid";
import { getRepository }           from "@/server/storage/repository";

// ─── Core recorder ────────────────────────────────────────────────────────────

async function record(
  memberId:     string,
  type:         CreditTransactionType,
  amount:       number,
  balanceAfter: number,
  source:       CreditTransactionSource,
  referenceId:  string,
  description?: string,
  metadata?:    Record<string, unknown>,
): Promise<void> {
  try {
    await getRepository().saveCreditTransaction({
      id:           randomUUID(),
      memberId,
      type,
      amount:       Math.abs(Math.round(amount)),
      balanceAfter: Math.round(balanceAfter),
      source,
      referenceId,
      description,
      metadata,
      createdAt:    new Date().toISOString(),
    });
  } catch (e) {
    // Transaction logging must NEVER crash the primary business flow.
    console.error("[GRID_LEDGER] Failed to save transaction:", {
      memberId,
      type,
      source,
      referenceId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export const ledgerService = {
  async recordEarnFromOrder(
    memberId:     string,
    credsEarned:  number,
    balanceAfter: number,
    orderId:      string,
  ): Promise<void> {
    return record(
      memberId,
      "EARN",
      credsEarned,
      balanceAfter,
      "ORDER",
      orderId,
      `Earned ${credsEarned} Creds from order ${orderId}`,
    );
  },

  async recordBonus(
    memberId:     string,
    amount:       number,
    balanceAfter: number,
    bonusType:    "WELCOME_BONUS" | `BIRTHDAY_${number}`,
  ): Promise<void> {
    return record(
      memberId,
      "BONUS",
      amount,
      balanceAfter,
      "SYSTEM",
      bonusType,
      `Bonus: ${bonusType}`,
    );
  },

  async recordRedemption(
    memberId:     string,
    credsSpent:   number,
    balanceAfter: number,
    couponCode:   string,
    wixCouponId:  string,
  ): Promise<void> {
    return record(
      memberId,
      "REDEEM",
      credsSpent,
      balanceAfter,
      "COUPON",
      couponCode,
      `Redeemed ${credsSpent} Creds for reward coupon`,
      { wixCouponId },
    );
  },

  async recordAdjustment(
    memberId:      string,
    amount:        number,
    balanceAfter:  number,
    referenceId:   string,
    description:   string,
    metadata?:     Record<string, unknown>,
  ): Promise<void> {
    return record(
      memberId,
      "ADJUSTMENT",
      amount,
      balanceAfter,
      "ADMIN",
      referenceId,
      description,
      metadata,
    );
  },
};
