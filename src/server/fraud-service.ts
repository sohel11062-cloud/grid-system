import "server-only";

import type {
  FraudSignal,
  GridMemberLedger,
  RedemptionRecord,
  GridCouponRecord,
  CreditTransaction,
} from "@/lib/grid";

import { getEnv } from "@/server/env";
import { getRepository } from "@/server/storage/repository";
import { writeAuditLog } from "@/server/audit-service";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1_000;

const HIGH_RISK_SCORE   = 55;
const MEDIUM_RISK_SCORE = 30;
const LOW_RISK_SCORE    = 12;

const MAX_DAILY_REDEMPTIONS          = 5;
const MAX_FAILED_REDEMPTIONS         = 3;
const MAX_RECOVERABLE_REDEMPTIONS    = 2;
const MAX_ACTIVE_COUPON_EXPOSURE     = 0.8;
const MAX_SINGLE_REDEMPTION_RATIO    = 0.7;
const MAX_DAILY_REDEEM_PERCENT       = 0.9;
const MAX_DUPLICATE_AMOUNT_THRESHOLD = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function signal(
  key: string,
  severity: FraudSignal["severity"],
  message: string,
): FraudSignal {
  return {
    key,
    severity,
    message,
    recordedAt: new Date().toISOString(),
  };
}

function severityToScore(
  severity: FraudSignal["severity"],
): number {
  switch (severity) {
    case "HIGH":
      return HIGH_RISK_SCORE;

    case "MEDIUM":
      return MEDIUM_RISK_SCORE;

    default:
      return LOW_RISK_SCORE;
  }
}

function calculateFraudScore(
  signals: FraudSignal[],
): number {
  return Math.min(
    100,
    signals.reduce(
      (sum, s) => sum + severityToScore(s.severity),
      0,
    ),
  );
}

function countDuplicateRedemptionAmounts(
  transactions: CreditTransaction[],
): number {
  const map = new Map<number, number>();

  for (const tx of transactions) {
    const amount =
      Math.abs(tx.amount ?? 0);

    map.set(
      amount,
      (map.get(amount) ?? 0) + 1,
    );
  }

  let duplicates = 0;

  for (const count of map.values()) {
    if (count >= MAX_DUPLICATE_AMOUNT_THRESHOLD) {
      duplicates++;
    }
  }

  return duplicates;
}

function getTotalRecentRedeemedCreds(
  transactions: CreditTransaction[],
): number {
  return transactions.reduce(
    (sum, tx) => sum + Math.abs(tx.amount ?? 0),
    0,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Fraud Engine
// ─────────────────────────────────────────────────────────────────────────────

export async function assessMemberFraudRisk(
  memberId: string,
): Promise<
  Pick<
    GridMemberLedger,
    "fraudHold" | "fraudScore" | "fraudSignals"
  >
> {

  const repo = getRepository();

  const ledger =
    await repo.getMemberLedger(memberId);

  if (!ledger) {
    return {
      fraudHold: false,
      fraudScore: 0,
      fraudSignals: [],
    };
  }

  const since =
    new Date(Date.now() - DAY_MS);

  const [
    recentTransactions,
    coupons,
    redemptions,
  ] = await Promise.all([
    repo.listCreditTransactions(memberId, {
      since,
      limit: 500,
    }),

    repo.listCouponsByMember(
      memberId,
      200,
    ),

    repo.listRedemptions({
      memberId,
      limit: 200,
    }),
  ]);

  const signals: FraudSignal[] = [];

  // ───────────────────────────────────────────────────────────────────────────
  // Transaction Analysis
  // ───────────────────────────────────────────────────────────────────────────

  const recentRedeems =
    recentTransactions.filter(
      (tx) => tx.type === "REDEEM",
    );

  const totalRecentRedeemed =
    getTotalRecentRedeemedCreds(
      recentRedeems,
    );

  const duplicateAmountCount =
    countDuplicateRedemptionAmounts(
      recentRedeems,
    );

  // ───────────────────────────────────────────────────────────────────────────
  // Redemption Analysis
  // ───────────────────────────────────────────────────────────────────────────

  const failedRedemptions =
    redemptions.filter(
      (r) => r.status === "FAILED",
    ).length;

  const recoverableRedemptions =
    redemptions.filter(
      (r) => r.status === "RECOVERABLE",
    ).length;

  // ───────────────────────────────────────────────────────────────────────────
  // Coupon Analysis
  // ───────────────────────────────────────────────────────────────────────────

  const activeCoupons =
    coupons.filter(
      (c) => c.status === "ACTIVE",
    );

  const activeCouponExposure =
    activeCoupons.reduce(
      (sum, c) => sum + c.credsSpent,
      0,
    );

  // ───────────────────────────────────────────────────────────────────────────
  // Signal: Impossible Balance State
  // ───────────────────────────────────────────────────────────────────────────

  if (
    ledger.redeemedCreds >
    ledger.lifetimeCreds
  ) {
    signals.push(
      signal(
        "REDEEMED_EXCEEDS_LIFETIME",
        "HIGH",
        "Redeemed Cred total exceeds lifetime Cred issuance.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Signal: High Redemption Velocity
  // ───────────────────────────────────────────────────────────────────────────

  if (
    recentRedeems.length >=
    MAX_DAILY_REDEMPTIONS
  ) {
    signals.push(
      signal(
        "REDEMPTION_VELOCITY",
        "MEDIUM",
        "Excessive redemption frequency detected within 24 hours.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Signal: Excessive Daily Redemption Volume
  // ───────────────────────────────────────────────────────────────────────────

  if (
    totalRecentRedeemed >=
    ledger.lifetimeCreds *
      MAX_DAILY_REDEEM_PERCENT
  ) {
    signals.push(
      signal(
        "REDEMPTION_VOLUME_SPIKE",
        "HIGH",
        "Recent redemption volume is abnormally high relative to lifetime Creds.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Signal: Failed Redemption Cluster
  // ───────────────────────────────────────────────────────────────────────────

  if (
    failedRedemptions >=
    MAX_FAILED_REDEMPTIONS
  ) {
    signals.push(
      signal(
        "FAILED_REDEMPTION_CLUSTER",
        "MEDIUM",
        "Multiple failed redemption attempts detected.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Signal: Recoverable Coupon Incidents
  // ───────────────────────────────────────────────────────────────────────────

  if (
    recoverableRedemptions >=
    MAX_RECOVERABLE_REDEMPTIONS
  ) {
    signals.push(
      signal(
        "RECOVERABLE_REDEMPTIONS",
        "HIGH",
        "Multiple recoverable coupon incidents detected.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Signal: Excessive Active Coupon Exposure
  // ───────────────────────────────────────────────────────────────────────────

  if (
    activeCouponExposure >
    Math.max(ledger.lifetimeCreds, 1) *
      MAX_ACTIVE_COUPON_EXPOSURE
  ) {
    signals.push(
      signal(
        "ACTIVE_COUPON_EXPOSURE",
        "MEDIUM",
        "Outstanding active coupon exposure is abnormally high.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Signal: Suspicious Repeated Amounts
  // ───────────────────────────────────────────────────────────────────────────

  if (duplicateAmountCount > 0) {
    signals.push(
      signal(
        "REPEATED_REDEMPTION_PATTERN",
        "LOW",
        "Repeated identical redemption amounts detected.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Signal: Single Massive Redemption
  // ───────────────────────────────────────────────────────────────────────────

  const largestCoupon =
    activeCoupons.reduce(
      (max, c) =>
        Math.max(max, c.credsSpent),
      0,
    );

  if (
    largestCoupon >
    ledger.lifetimeCreds *
      MAX_SINGLE_REDEMPTION_RATIO
  ) {
    signals.push(
      signal(
        "SINGLE_REDEMPTION_SPIKE",
        "HIGH",
        "Single coupon redemption size is disproportionately large.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Final Scoring
  // ───────────────────────────────────────────────────────────────────────────

  const fraudScore =
    calculateFraudScore(signals);

  const fraudHold =
    fraudScore >=
    getEnv().FRAUD_HOLD_SCORE;

  const result = {
    fraudHold,
    fraudScore,
    fraudSignals: signals,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Persist Assessment
  // ───────────────────────────────────────────────────────────────────────────

  await repo.setFraudAssessment(
    memberId,
    result,
    new Date().toISOString(),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Security Audit Logging
  // ───────────────────────────────────────────────────────────────────────────

  if (fraudHold) {

    await writeAuditLog({
      action: "FRAUD_HOLD_APPLIED",

      severity: "SECURITY",

      message:
        "Automated fraud engine placed member on fraud hold.",

      memberId,

      metadata: {
        fraudScore,
        signals,
        recentRedeems:
          recentRedeems.length,
        failedRedemptions,
        recoverableRedemptions,
        activeCouponExposure,
      },
    });

  } else if (signals.length > 0) {

    await writeAuditLog({
      action: "FRAUD_SIGNAL_DETECTED",

      severity: "SECURITY",

      message:
        "Fraud signals detected but below hold threshold.",

      memberId,

      metadata: {
        fraudScore,
        signals,
      },
    });
  }

  return result;
}