import "server-only";

import type { UserStats } from "@/lib/grid";
import { getRepository } from "@/server/storage/repository";

/**
 * Compute user stats from the ledger + coupon collections.
 * Used by the weekly report and any external stats endpoints.
 */
export async function getUserStats(memberId: string): Promise<UserStats | null> {
  const repo = getRepository();

  const [ledger, couponSummary] = await Promise.all([
    repo.getMemberLedger(memberId),
    repo.getCouponSummary(memberId),
  ]);

  if (!ledger) return null;

  return {
    memberId:               ledger.memberId,
    username:               ledger.username,
    email:                  ledger.email,
    currentBalance:         ledger.availableCreds,
    totalCredsEarned:       ledger.lifetimeCreds,
    totalCredsRedeemed:     ledger.redeemedCreds,
    totalCouponsGenerated:  couponSummary.total - couponSummary.failed,
    totalCouponsUsed:       couponSummary.used,
    totalCouponsActive:     couponSummary.active,
    totalCouponsExpired:    couponSummary.expired,
    totalSavingsRupees:     couponSummary.totalSavingsRupees,
  };
}
