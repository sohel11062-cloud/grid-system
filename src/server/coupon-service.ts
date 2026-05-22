import "server-only";

import {
  credsToRupees,
  type GridCouponRecord,
  type GridDashboardData,
  type RedemptionRecord,
} from "@/lib/grid";
import { AppError, ErrorCode }                    from "@/server/errors";
import { MSG, logInfo, logError, logWarn }         from "@/server/brand";
import { ledgerService }                           from "@/server/ledger-service";
import { createCouponCode }                        from "@/server/security";
import { assertLedgerExists, getDashboardForMember } from "@/server/grid-service";
import { getRepository }                           from "@/server/storage/repository";
import { createMoneyOffCoupon, isDuplicateCodeError } from "@/server/wix";
import { assessMemberFraudRisk } from "@/server/fraud-service";
import { writeAuditLog } from "@/server/audit-service";

const MAX_CODE_ATTEMPTS = 3;

export async function redeemMemberCreds(
  memberId:        string,
  creds:           number,
  idempotencyKey?: string,
): Promise<{ coupon: GridCouponRecord; dashboard: GridDashboardData }> {

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!Number.isFinite(creds) || creds <= 0) {
    throw new AppError(MSG.VALIDATION_ERROR, 400, ErrorCode.VALIDATION_ERROR);
  }
  if (creds % 100 !== 0) {
    throw new AppError(
      "Redemptions must be in multiples of 100 Creds.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const key = idempotencyKey?.trim();
  if (!key || key.length < 12) {
    throw new AppError(
      "An idempotency key is required for secure reward processing.",
      400,
      ErrorCode.IDEMPOTENCY_REQUIRED,
    );
  }

  const repo   = getRepository();
  const ledger = await assertLedgerExists(memberId);
  const risk = await assessMemberFraudRisk(memberId);
  if (risk.fraudHold) {
    throw new AppError(
      "This account is on fraud hold. Please contact support.",
      403,
      ErrorCode.FRAUD_HOLD,
    );
  }

  const existingRedemption = await repo.getRedemptionByIdempotencyKey(memberId, key);
  if (existingRedemption) {
    const coupons = await repo.listCouponsByMember(memberId, 100);
    const coupon = coupons.find((c) => c.code === existingRedemption.couponCode);
    if (existingRedemption.status === "ISSUED" && coupon) {
      const dashboard = await getDashboardForMember(memberId, false);
      return { coupon, dashboard };
    }
    throw new AppError(
      `Redemption key already used with status ${existingRedemption.status}.`,
      409,
      ErrorCode.IDEMPOTENCY_CONFLICT,
    );
  }

  if (ledger.availableCreds < creds) {
    throw new AppError(
      `${MSG.INSUFFICIENT_BALANCE} Available: ${ledger.availableCreds}, requested: ${creds}.`,
      400,
      ErrorCode.INSUFFICIENT_BALANCE,
    );
  }

  const rupeeInt = Math.floor(credsToRupees(creds));
  if (rupeeInt <= 0) {
    throw new AppError(
      "Coupon value must be at least ₹1.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const now       = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString();
  const redemption: RedemptionRecord = await repo.saveRedemption({
    id: crypto.randomUUID(),
    memberId,
    credsSpent: creds,
    valueRupees: rupeeInt,
    status: "PENDING",
    idempotencyKey: key,
    createdAt: now,
    updatedAt: now,
  });

  // ── Create coupon via Reward Engine (retry on duplicate code) ──────────────
  let wixCouponId: string | undefined;
  let finalCode:   string | undefined;
  let lastError:   unknown;

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = createCouponCode();
    try {
      const res   = await createMoneyOffCoupon({ code, amount: rupeeInt });
      wixCouponId = res.coupon!.id!;
      finalCode   = code;
      break;
    } catch (err) {
      lastError = err;
      if (isDuplicateCodeError(err) && attempt < MAX_CODE_ATTEMPTS) {
        logWarn(memberId, "COUPON_CREATE", `Duplicate code attempt ${attempt} — regenerating`);
        continue;
      }
      break;
    }
  }

  // ── Failed — save audit record, do NOT deduct Creds ───────────────────────
  if (!wixCouponId || !finalCode) {
    const failed: GridCouponRecord = {
      id:          crypto.randomUUID(),
      memberId:    ledger.memberId,
      contactId:   ledger.contactId,
      email:       ledger.email,
      code:        finalCode ?? createCouponCode(),
      valueRupees: rupeeInt,
      credsSpent:  creds,
      status:      "FAILED",
      createdAt:   now,
      expiresAt,
      note:        MSG.COUPON_FAILED,
    };
    try { await repo.saveCoupon(failed); } catch (e) {
      logError(memberId, "SAVE_FAILED_COUPON", e);
    }
    await repo.updateRedemption(redemption.id, {
      status: "FAILED",
      couponCode: failed.code,
      couponId: failed.id,
      failureReason: MSG.COUPON_FAILED,
      updatedAt: new Date().toISOString(),
    });
    logError(memberId, "COUPON_CREATE", lastError, { attempts: MAX_CODE_ATTEMPTS });
    throw new AppError(MSG.COUPON_FAILED, 502, ErrorCode.COUPON_CREATE_FAILED);
  }

  // ── Atomically deduct Creds ────────────────────────────────────────────────
  const updated = await repo.atomicRedemption(memberId, creds, now);
  if (!updated) {
    // Coupon was issued but deduction failed (race condition).
    // Operations must void the Wix coupon manually.
    console.error("[GRID_COUPON] RACE_CONDITION — coupon created but deduction failed", {
      memberId,
      creds,
      couponCode: finalCode,
      wixCouponId,
    });
    await repo.updateRedemption(redemption.id, {
      status: "RECOVERABLE",
      couponCode: finalCode,
      wixCouponId,
      recoveryNote: "Wix coupon was issued but local Cred deduction failed.",
      updatedAt: new Date().toISOString(),
    });
    await writeAuditLog({
      action: "REDEMPTION_RECOVERY_REQUIRED",
      severity: "ERROR",
      message: "Coupon was issued before atomic Cred deduction failed.",
      memberId,
      metadata: { couponCode: finalCode, wixCouponId, creds },
    });
    throw new AppError(MSG.REDEMPTION_RACE, 409, ErrorCode.CONCURRENT_REDEMPTION);
  }

  // ── Persist coupon record ──────────────────────────────────────────────────
  const coupon: GridCouponRecord = {
    id:          crypto.randomUUID(),
    memberId:    updated.memberId,
    contactId:   updated.contactId,
    email:       updated.email,
    code:        finalCode,
    valueRupees: rupeeInt,
    credsSpent:  creds,
    status:      "ACTIVE",
    createdAt:   now,
    expiresAt,
    wixCouponId,
  };

  await repo.saveCoupon(coupon);
  await repo.updateRedemption(redemption.id, {
    status: "ISSUED",
    couponId: coupon.id,
    couponCode: coupon.code,
    wixCouponId,
    updatedAt: new Date().toISOString(),
  });
  await ledgerService.recordRedemption(
    memberId,
    creds,
    updated.availableCreds,
    finalCode,
    wixCouponId,
  );

  logInfo(memberId, "REDEEM_SUCCESS", "OK", {
    code:          finalCode,
    credsDeducted: creds,
    newBalance:    updated.availableCreds,
  });
  await writeAuditLog({
    action: "REDEMPTION_ISSUED",
    message: "Member redeemed Creds for a unique Wix coupon.",
    memberId,
    metadata: { couponCode: finalCode, wixCouponId, creds },
  });

  const dashboard = await getDashboardForMember(memberId, false);
  return { coupon, dashboard };
}
