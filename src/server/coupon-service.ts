import "server-only";

import { credsToRupees, type GridCouponRecord } from "@/lib/grid";
import { AppError, ErrorCode } from "@/server/errors";
import { createCouponCode } from "@/server/security";
import { assertLedgerExists, getDashboardForMember } from "@/server/grid-service";
import { getRepository } from "@/server/storage/repository";
import { createMoneyOffCoupon, isDuplicateCodeError } from "@/server/wix";

/** Maximum attempts to generate a unique coupon code */
const MAX_CODE_ATTEMPTS = 3;

export async function redeemMemberCreds(
  memberId: string,
  creds:    number
): Promise<{
  coupon:    GridCouponRecord;
  dashboard: Awaited<ReturnType<typeof getDashboardForMember>>;
}> {

  // ── 1. Input validation ────────────────────────────────────────────────────
  if (!Number.isFinite(creds) || creds <= 0) {
    throw new AppError(
      "Cred amount must be a positive number.",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }
  if (creds % 100 !== 0) {
    throw new AppError(
      "Redemptions must be in multiples of 100 Creds.",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  // ── 2. Ledger existence + soft balance pre-check ───────────────────────────
  // (Fail fast to avoid unnecessary Wix API calls. The hard atomic check is
  //  performed later against the DB, so this is safe even if stale.)
  const repo   = getRepository();
  const ledger = await assertLedgerExists(memberId);

  if (ledger.availableCreds < creds) {
    throw new AppError(
      `Insufficient balance. Available: ${ledger.availableCreds} Creds, requested: ${creds}.`,
      400,
      ErrorCode.INSUFFICIENT_BALANCE
    );
  }

  // ── 3. Derive coupon value ─────────────────────────────────────────────────
  const valueRupees = credsToRupees(creds); // e.g. 1000 creds → ₹10.00
  // Ensure integer rupee amount (Wix requires integer moneyOffAmount)
  const rupeeInt = Math.floor(valueRupees);

  if (rupeeInt <= 0) {
    throw new AppError(
      "Coupon value must be at least ₹1.",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const now = new Date().toISOString();

  // ── 4. Create Wix coupon — retry on duplicate code (up to MAX_CODE_ATTEMPTS) ─
  let wixCouponId: string | undefined;
  let finalCode:   string | undefined;
  let lastCouponError: unknown;

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = createCouponCode();

    try {
      const wixRes = await createMoneyOffCoupon({ code, amount: rupeeInt });
      wixCouponId = wixRes.id;
      finalCode    = code;
      break; // success
    } catch (err) {
      lastCouponError = err;

      if (isDuplicateCodeError(err) && attempt < MAX_CODE_ATTEMPTS) {
        console.warn(
          `[THE_GRID_COUPON] Duplicate code "${code}" on attempt ${attempt} — regenerating`
        );
        continue; // try a new code
      }

      // Non-duplicate error OR exhausted attempts → give up
      break;
    }
  }

  if (!wixCouponId || !finalCode) {
    // Coupon creation failed — save a FAILED record with ZERO cred deduction
    const failedRecord: GridCouponRecord = {
      id:          crypto.randomUUID(),
      memberId:    ledger.memberId,
      contactId:   ledger.contactId,
      email:       ledger.email,
      code:        finalCode ?? createCouponCode(), // use last attempted code
      valueRupees: rupeeInt,
      credsSpent:  creds,
      status:      "FAILED",
      createdAt:   now,
      note:
        lastCouponError instanceof AppError
          ? lastCouponError.message
          : "Wix coupon creation failed. No Creds were deducted.",
    };

    // Best-effort save for audit
    try {
      await repo.saveCoupon(failedRecord);
    } catch (saveErr) {
      console.error("[THE_GRID_FAILED_COUPON_SAVE_ERROR]", saveErr);
    }

    console.error("[THE_GRID_COUPON_FAILED]", {
      memberId,
      attempts: MAX_CODE_ATTEMPTS,
      error:    lastCouponError,
    });

    const userMessage =
      lastCouponError instanceof AppError
        ? lastCouponError.message
        : "Coupon creation failed — your Creds were NOT deducted. " +
          "Please verify Wix Store is installed and API key has 'Manage Coupons' permission.";

    throw new AppError(userMessage, 502, ErrorCode.COUPON_CREATE_FAILED);
  }

  // ── 5. ATOMIC cred deduction ───────────────────────────────────────────────
  //
  // Uses a conditional DB update: only succeeds when availableCreds >= creds
  // at write time. This prevents double-deduction from concurrent requests.
  //
  // If this returns null it means another concurrent request already reduced
  // the balance between our pre-check (step 2) and now. The Wix coupon already
  // exists — we log the discrepancy but don't deduct (the coupon is effectively
  // a goodwill coupon for this rare race-condition case).
  const updatedLedger = await repo.atomicRedemption(memberId, creds, now);

  if (!updatedLedger) {
    console.error("[THE_GRID_CRITICAL_RACE_CONDITION]", {
      memberId,
      creds,
      wixCouponId,
      message:
        "Wix coupon was created but atomic deduction failed (concurrent request). " +
        "Coupon exists in Wix without cred deduction.",
    });

    throw new AppError(
      "A concurrent redemption was detected and your request could not be completed safely. " +
      "Your Creds were NOT deducted. Please try again.",
      409,
      ErrorCode.CONCURRENT_REDEMPTION,
      { wixCouponId } // include so support can look it up if needed
    );
  }

  // ── 6. Save coupon record ──────────────────────────────────────────────────
  const coupon: GridCouponRecord = {
    id:          crypto.randomUUID(),
    memberId:    updatedLedger.memberId,
    contactId:   updatedLedger.contactId,
    email:       updatedLedger.email,
    code:        finalCode,
    valueRupees: rupeeInt,
    credsSpent:  creds,
    status:      "ACTIVE",
    createdAt:   now,
    wixCouponId,
  };

  await repo.saveCoupon(coupon);

  console.info("[THE_GRID_REDEMPTION_SUCCESS]", {
    memberId,
    code:              finalCode,
    wixCouponId,
    credsDeducted:     creds,
    newAvailableCreds: updatedLedger.availableCreds,
  });

  return {
    coupon,
    dashboard: await getDashboardForMember(memberId, false),
  };
}