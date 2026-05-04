import "server-only";

import { randomUUID } from "crypto";
import type { CreditTransactionSource, CreditTransactionType } from "@/lib/grid";
import { getRepository } from "@/server/storage/repository";

/**
 * Central service for creating auditable credit transaction records.
 * Called by grid-service (EARN/BONUS) and coupon-service (REDEEM).
 *
 * RULES:
 * - Every call is idempotent (duplicate index on memberId+referenceId+type)
 * - `balanceAfter` reflects the ledger state at the time of the call
 * - Never throws — transaction failures are logged, not fatal
 */

async function record(
  memberId:     string,
  type:         CreditTransactionType,
  amount:       number,
  balanceAfter: number,
  source:       CreditTransactionSource,
  referenceId:  string,
  description?: string,
  metadata?:    Record<string, unknown>
): Promise<void> {
  try {
    await getRepository().saveCreditTransaction({
      id:           randomUUID(),
      memberId,
      type,
      amount:       Math.abs(Math.round(amount)), // always positive integer
      balanceAfter: Math.round(balanceAfter),
      source,
      referenceId,
      description,
      metadata,
      createdAt:    new Date().toISOString(),
    });
  } catch (e) {
    // Transaction logging must not crash the main flow
    console.error("[THE_GRID_LEDGER_SERVICE] Failed to save credit_transaction:", {
      memberId, type, source, referenceId, error: e,
    });
  }
}

export const ledgerService = {
  /** Record credit earned from a Wix order */
  async recordEarnFromOrder(
    memberId:     string,
    credsEarned:  number,
    balanceAfter: number,
    orderId:      string
  ): Promise<void> {
    return record(
      memberId, "EARN", credsEarned, balanceAfter,
      "ORDER", orderId,
      `Earned ${credsEarned} Creds from order ${orderId}`
    );
  },

  /** Record a welcome or birthday bonus */
  async recordBonus(
    memberId:     string,
    amount:       number,
    balanceAfter: number,
    bonusType:    "WELCOME_BONUS" | `BIRTHDAY_${number}`
  ): Promise<void> {
    return record(
      memberId, "BONUS", amount, balanceAfter,
      "SYSTEM", bonusType,
      `Bonus: ${bonusType}`
    );
  },

  /** Record a coupon redemption (creds spent) */
  async recordRedemption(
    memberId:     string,
    credsSpent:   number,
    balanceAfter: number,
    couponCode:   string,
    wixCouponId:  string
  ): Promise<void> {
    return record(
      memberId, "REDEEM", credsSpent, balanceAfter,
      "COUPON", couponCode,
      `Redeemed ${credsSpent} Creds for coupon ${couponCode}`,
      { wixCouponId }
    );
  },
};