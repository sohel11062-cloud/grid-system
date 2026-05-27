import "server-only";

import {
  credsToRupees,
  type GridCouponRecord,
  type GridDashboardData,
  type RedemptionRecord,
} from "@/lib/grid";

import { AppError, ErrorCode } from "@/server/errors";

import {
  MSG,
  logError,
  logInfo,
  logWarn,
} from "@/server/brand";

import { ledgerService } from "@/server/ledger-service";

import { createCouponCode } from "@/server/security";

import {
  assertLedgerExists,
  getDashboardForMember,
} from "@/server/grid-service";

import { getRepository } from "@/server/storage/repository";

import {
  createMoneyOffCoupon,
  deleteCoupon,
  isDuplicateCodeError,
} from "@/server/wix";

import { assessMemberFraudRisk } from "@/server/fraud-service";

import { writeAuditLog } from "@/server/audit-service";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CODE_ATTEMPTS = 3;

const COUPON_EXPIRY_MS =
  365 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN REDEMPTION FLOW
// ─────────────────────────────────────────────────────────────────────────────

export async function redeemMemberCreds(
  memberId: string,
  creds: number,
  idempotencyKey?: string,
): Promise<{
  coupon: GridCouponRecord;
  dashboard: GridDashboardData;
}> {

  // ───────────────────────────────────────────────────────────────────────────
  // VALIDATION
  // ───────────────────────────────────────────────────────────────────────────

  if (!Number.isFinite(creds) || creds <= 0) {

    throw new AppError(
      MSG.VALIDATION_ERROR,
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  if (creds % 100 !== 0) {

    throw new AppError(
      "Redemptions must be in multiples of 100 Creds.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const key =
    idempotencyKey?.trim();

  if (!key || key.length < 12) {

    throw new AppError(
      "An idempotency key is required for secure reward processing.",
      400,
      ErrorCode.IDEMPOTENCY_REQUIRED,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INITIALIZE
  // ───────────────────────────────────────────────────────────────────────────

  const repo =
    getRepository();

  const ledger =
    await assertLedgerExists(memberId);

  // ───────────────────────────────────────────────────────────────────────────
  // FRAUD CHECK
  // ───────────────────────────────────────────────────────────────────────────

  const risk =
    await assessMemberFraudRisk(memberId);

  if (risk.fraudHold) {

    throw new AppError(
      "This account is on fraud hold. Please contact support.",
      403,
      ErrorCode.FRAUD_HOLD,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // IDEMPOTENCY CHECK
  // ───────────────────────────────────────────────────────────────────────────

  const existingRedemption =
    await repo.getRedemptionByIdempotencyKey(
      memberId,
      key,
    );

  if (existingRedemption) {

    const coupons =
      await repo.listCouponsByMember(
        memberId,
        100,
      );

    const coupon =
      coupons.find(
        (c: GridCouponRecord) =>
          c.code ===
          existingRedemption.couponCode,
      );

    if (
      existingRedemption.status === "ISSUED" &&
      coupon
    ) {

      const dashboard =
        await getDashboardForMember(
          memberId,
          false,
        );

      return {
        coupon,
        dashboard,
      };
    }

    throw new AppError(
      `Redemption key already used with status ${existingRedemption.status}.`,
      409,
      ErrorCode.IDEMPOTENCY_CONFLICT,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BALANCE CHECK
  // ───────────────────────────────────────────────────────────────────────────

  if (ledger.availableCreds < creds) {

    throw new AppError(
      `${MSG.INSUFFICIENT_BALANCE} Available: ${ledger.availableCreds}, requested: ${creds}.`,
      400,
      ErrorCode.INSUFFICIENT_BALANCE,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VALUE CONVERSION
  // ───────────────────────────────────────────────────────────────────────────

  const rupeeValue =
    Math.floor(
      credsToRupees(creds),
    );

  if (rupeeValue <= 0) {

    throw new AppError(
      "Coupon value must be at least ₹1.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TIMESTAMPS
  // ───────────────────────────────────────────────────────────────────────────

  const now =
    new Date().toISOString();

  const expiresAt =
    new Date(
      Date.now() +
      COUPON_EXPIRY_MS,
    ).toISOString();

  // ───────────────────────────────────────────────────────────────────────────
  // CREATE REDEMPTION RECORD
  // ───────────────────────────────────────────────────────────────────────────

  const redemption: RedemptionRecord =
    await repo.saveRedemption({
      id:
        crypto.randomUUID(),

      memberId,

      credsSpent:
        creds,

      valueRupees:
        rupeeValue,

      status:
        "PENDING",

      idempotencyKey:
        key,

      createdAt:
        now,

      updatedAt:
        now,
    });

  // ───────────────────────────────────────────────────────────────────────────
  // CREATE WIX COUPON
  // ───────────────────────────────────────────────────────────────────────────

  let wixCouponId:
    | string
    | undefined;

  let finalCode:
    | string
    | undefined;

  let lastError:
    | unknown;

  for (
    let attempt = 1;
    attempt <= MAX_CODE_ATTEMPTS;
    attempt++
  ) {

    const generatedCode =
      createCouponCode();

    try {

      console.log(
        "[GRID_REDEMPTION_ATTEMPT]",
        {
          attempt,
          memberId,
          generatedCode,
          rupeeValue,
        },
      );

      const response =
        await createMoneyOffCoupon({
          code:
            generatedCode,

          amount:
            rupeeValue,
        });

      console.log(
        "[GRID_WIX_COUPON_RESPONSE]",
        JSON.stringify(
          response,
          null,
          2,
        ),
      );

      wixCouponId =
        response?.id ??
        undefined;

      if (!wixCouponId) {

        throw new Error(
          "Wix returned no coupon ID.",
        );
      }

      finalCode =
        generatedCode;

      break;

    } catch (error) {

      lastError =
        error;

      console.error(
        "[GRID_WIX_COUPON_CREATE_ERROR]",
        {
          attempt,

          message:
            error instanceof Error
              ? error.message
              : String(error),

          error,
        },
      );

      // DUPLICATE CODE RETRY
      if (
        isDuplicateCodeError(error) &&
        attempt < MAX_CODE_ATTEMPTS
      ) {

        logWarn(
          memberId,
          "COUPON_CREATE_DUPLICATE",
          `Duplicate coupon code on attempt ${attempt}. Regenerating.`,
        );

        continue;
      }

      break;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // COUPON CREATION FAILED
  // ───────────────────────────────────────────────────────────────────────────

  if (
    !wixCouponId ||
    !finalCode
  ) {

    const failedCoupon: GridCouponRecord = {

      id:
        crypto.randomUUID(),

      memberId:
        ledger.memberId,

      contactId:
        ledger.contactId,

      email:
        ledger.email,

      code:
        finalCode ??
        createCouponCode(),

      valueRupees:
        rupeeValue,

      credsSpent:
        creds,

      status:
        "FAILED",

      createdAt:
        now,

      expiresAt,

      note:
        MSG.COUPON_FAILED,
    };

    try {

      await repo.saveCoupon(
        failedCoupon,
      );

    } catch (saveError) {

      logError(
        memberId,
        "SAVE_FAILED_COUPON",
        saveError,
      );
    }

    await repo.updateRedemption(
      redemption.id,
      {
        status:
          "FAILED",

        couponCode:
          failedCoupon.code,

        couponId:
          failedCoupon.id,

        failureReason:
          MSG.COUPON_FAILED,

        updatedAt:
          new Date().toISOString(),
      },
    );

    logError(
      memberId,
      "COUPON_CREATE_FAILED",
      lastError,
      {
        attempts:
          MAX_CODE_ATTEMPTS,
      },
    );

    await writeAuditLog({
      action:
        "COUPON_CREATE_FAILED",

      severity:
        "ERROR",

      message:
        "Wix coupon generation failed after retry attempts.",

      memberId,

      metadata: {
        creds,
        rupeeValue,
      },
    });

    throw new AppError(
      MSG.COUPON_FAILED,
      502,
      ErrorCode.COUPON_CREATE_FAILED,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ATOMIC CRED DEDUCTION
  // ───────────────────────────────────────────────────────────────────────────

  const updatedLedger =
    await repo.atomicRedemption(
      memberId,
      creds,
      now,
    );

  // ───────────────────────────────────────────────────────────────────────────
  // RACE CONDITION RECOVERY
  // ───────────────────────────────────────────────────────────────────────────

  if (!updatedLedger) {

    console.error(
      "[GRID_RACE_CONDITION]",
      {
        memberId,
        creds,
        couponCode:
          finalCode,
        wixCouponId,
      },
    );

    try {

      if (wixCouponId) {

        await deleteCoupon(
          wixCouponId,
        );

        console.log(
          "[GRID_WIX_COUPON_ROLLBACK_SUCCESS]",
          {
            memberId,
            wixCouponId,
          },
        );
      }

    } catch (rollbackError) {

      console.error(
        "[GRID_WIX_COUPON_ROLLBACK_FAILED]",
        rollbackError,
      );
    }

    await repo.updateRedemption(
      redemption.id,
      {
        status:
          "RECOVERABLE",

        couponCode:
          finalCode,

        wixCouponId,

        recoveryNote:
          "Wix coupon was issued but atomic Cred deduction failed.",

        updatedAt:
          new Date().toISOString(),
      },
    );

    await writeAuditLog({
      action:
        "REDEMPTION_RECOVERY_REQUIRED",

      severity:
        "ERROR",

      message:
        "Coupon issued before atomic deduction failed.",

      memberId,

      metadata: {
        couponCode:
          finalCode,

        wixCouponId,

        creds,
      },
    });

    throw new AppError(
      MSG.REDEMPTION_RACE,
      409,
      ErrorCode.CONCURRENT_REDEMPTION,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SAVE FINAL COUPON
  // ───────────────────────────────────────────────────────────────────────────

  const coupon: GridCouponRecord = {

    id:
      crypto.randomUUID(),

    memberId:
      updatedLedger.memberId,

    contactId:
      updatedLedger.contactId,

    email:
      updatedLedger.email,

    code:
      finalCode,

    valueRupees:
      rupeeValue,

    credsSpent:
      creds,

    status:
      "ACTIVE",

    createdAt:
      now,

    expiresAt,

    wixCouponId,
  };

  await repo.saveCoupon(
    coupon,
  );

  // ───────────────────────────────────────────────────────────────────────────
  // UPDATE REDEMPTION
  // ───────────────────────────────────────────────────────────────────────────

  await repo.updateRedemption(
    redemption.id,
    {
      status:
        "ISSUED",

      couponId:
        coupon.id,

      couponCode:
        coupon.code,

      wixCouponId,

      updatedAt:
        new Date().toISOString(),
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // LEDGER RECORD
  // ───────────────────────────────────────────────────────────────────────────

  await ledgerService.recordRedemption(
    memberId,
    creds,
    updatedLedger.availableCreds,
    finalCode,
    wixCouponId,
  );

  // ───────────────────────────────────────────────────────────────────────────
  // LOGGING
  // ───────────────────────────────────────────────────────────────────────────

  logInfo(
    memberId,
    "REDEEM_SUCCESS",
    "OK",
    {
      code:
        finalCode,

      credsDeducted:
        creds,

      newBalance:
        updatedLedger.availableCreds,

      wixCouponId,
    },
  );

  await writeAuditLog({
    action:
      "REDEMPTION_ISSUED",

    message:
      "Member redeemed Creds for a Wix coupon.",

    memberId,

    metadata: {
      couponCode:
        finalCode,

      wixCouponId,

      creds,

      rupeeValue,
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // REFRESH DASHBOARD
  // ───────────────────────────────────────────────────────────────────────────

  const dashboard =
    await getDashboardForMember(
      memberId,
      false,
    );

  return {
    coupon,
    dashboard,
  };
}