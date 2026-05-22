import "server-only";

import type { FraudSignal, GridMemberLedger } from "@/lib/grid";
import { getEnv } from "@/server/env";
import { getRepository } from "@/server/storage/repository";
import { writeAuditLog } from "@/server/audit-service";

const DAY_MS = 24 * 60 * 60 * 1_000;

function signal(
  key: string,
  severity: FraudSignal["severity"],
  message: string,
): FraudSignal {
  return { key, severity, message, recordedAt: new Date().toISOString() };
}

export async function assessMemberFraudRisk(
  memberId: string,
): Promise<Pick<GridMemberLedger, "fraudHold" | "fraudScore" | "fraudSignals">> {
  const repo = getRepository();
  const ledger = await repo.getMemberLedger(memberId);
  if (!ledger) return { fraudHold: false, fraudScore: 0, fraudSignals: [] };

  const since = new Date(Date.now() - DAY_MS);
  const [recentTxs, coupons, redemptions] = await Promise.all([
    repo.listCreditTransactions(memberId, { since, limit: 500 }),
    repo.listCouponsByMember(memberId, 200),
    repo.listRedemptions({ memberId, limit: 200 }),
  ]);

  const signals: FraudSignal[] = [];
  const recentRedemptions = recentTxs.filter((tx) => tx.type === "REDEEM");
  const failedRedemptions = redemptions.filter((r) => r.status === "FAILED").length;
  const recoverableRedemptions = redemptions.filter((r) => r.status === "RECOVERABLE").length;

  if (ledger.redeemedCreds > ledger.lifetimeCreds) {
    signals.push(signal(
      "REDEEMED_EXCEEDS_LIFETIME",
      "HIGH",
      "Redeemed Cred total exceeds lifetime Cred issuance.",
    ));
  }

  if (recentRedemptions.length >= 5) {
    signals.push(signal(
      "REDEMPTION_VELOCITY",
      "MEDIUM",
      "Five or more redemption ledger events were recorded in the last 24 hours.",
    ));
  }

  if (failedRedemptions + recoverableRedemptions >= 3) {
    signals.push(signal(
      "REDEMPTION_FAILURE_CLUSTER",
      "MEDIUM",
      "Multiple failed or recoverable redemption attempts are attached to this account.",
    ));
  }

  const activeCouponValue = coupons
    .filter((c) => c.status === "ACTIVE")
    .reduce((sum, c) => sum + c.credsSpent, 0);
  if (activeCouponValue > Math.max(ledger.lifetimeCreds, 1) * 0.8) {
    signals.push(signal(
      "ACTIVE_COUPON_EXPOSURE",
      "LOW",
      "Active coupon exposure is unusually high relative to lifetime Creds.",
    ));
  }

  const score = Math.min(
    100,
    signals.reduce((sum, s) => {
      if (s.severity === "HIGH") return sum + 55;
      if (s.severity === "MEDIUM") return sum + 30;
      return sum + 12;
    }, 0),
  );
  const fraudHold = score >= getEnv().FRAUD_HOLD_SCORE;
  const result = { fraudHold, fraudScore: score, fraudSignals: signals };
  await repo.setFraudAssessment(memberId, result, new Date().toISOString());

  if (fraudHold) {
    await writeAuditLog({
      action: "FRAUD_HOLD_APPLIED",
      severity: "SECURITY",
      message: "Automated anti-cheat scoring placed a member on fraud hold.",
      memberId,
      metadata: { score, signals },
    });
  }

  return result;
}
