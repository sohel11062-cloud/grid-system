import "server-only";

import { credsToRupees, type GridCouponRecord } from "@/lib/grid";
import { AppError, ErrorCode } from "@/server/errors";
import { ledgerService } from "@/server/ledger-service";
import { createCouponCode } from "@/server/security";
import { assertLedgerExists, getDashboardForMember } from "@/server/grid-service";
import { getRepository } from "@/server/storage/repository";
import { createMoneyOffCoupon, isDuplicateCodeError } from "@/server/wix";

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
    throw new AppError("Cred amount must be a positive number.", 400, ErrorCode.VALIDATION_ERROR);
  }
  if (creds % 100 !== 0) {
    throw new AppError("Redemptions must be in multiples of 100 Creds.", 400, ErrorCode.VALIDATION_ERROR);
  }

  const repo    = getRepository();
  const ledger  = await assertLedgerExists(memberId);

  // ── 2. Soft balance pre-check ──────────────────────────────────────────────
  if (ledger.availableCreds < creds) {
    throw new AppError(
      `Insufficient balance. Available: ${ledger.availableCreds}, requested: ${creds}.`,
      400,
      ErrorCode.INSUFFICIENT_BALANCE
    );
  }

  const valueRupees = credsToRupees(creds);
  const rupeeInt    = Math.floor(valueRupees); // Wix requires integer

  if (rupeeInt <= 0) {
    throw new AppError("Coupon value must be at least ₹1.", 400, ErrorCode.VALIDATION_ERROR);
  }

  // ── 3. Idempotency: prevent duplicate REDEEM transactions ─────────────────
  // (In case the client retries after a timeout mid-request)
  // We use a pre-generated idempotency key (the coupon code) later.

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

  // ── 4. Create Wix coupon (retry on duplicate code) ─────────────────────────
  let wixCouponId: string | undefined;
  let finalCode:   string | undefined;
  let lastError:   unknown;

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = createCouponCode();
    try {
      const wixRes = await createMoneyOffCoupon({ code, amount: rupeeInt });
      wixCouponId  = wixRes.id;
      finalCode    = code;
      break;
    } catch (err) {
      lastError = err;
      if (isDuplicateCodeError(err) && attempt < MAX_CODE_ATTEMPTS) {
        console.warn(`[THE_GRID_COUPON] Duplicate code on attempt ${attempt} — regenerating`);
        continue;
      }
      break;
    }
  }

  if (!wixCouponId || !finalCode) {
    // Save FAILED record for audit — zero cred deduction
    const failedCoupon: GridCouponRecord = {
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
      note:
        lastError instanceof AppError
          ? lastError.message
          : "Wix coupon creation failed. No Creds deducted.",
    };

    try { await repo.saveCoupon(failedCoupon); }
    catch (e) { console.error("[THE_GRID_FAILED_COUPON_SAVE]", e); }

    console.error("[THE_GRID_COUPON_FAILED]", { memberId, attempts: MAX_CODE_ATTEMPTS, error: lastError });

    throw new AppError(
      lastError instanceof AppError
        ? lastError.message
        : "Coupon creation failed — your Creds were NOT deducted.",
      502,
      ErrorCode.COUPON_CREATE_FAILED
    );
  }

  // ── 5. ATOMIC cred deduction ───────────────────────────────────────────────
  const updatedLedger = await repo.atomicRedemption(memberId, creds, now);

  if (!updatedLedger) {
    // Race condition: balance changed between pre-check and atomic update
    console.error("[THE_GRID_RACE_CONDITION]", {
      memberId, creds, wixCouponId,
      message: "Wix coupon created but atomic deduction failed.",
    });
    throw new AppError(
      "A concurrent request was detected. Your Creds were NOT deducted. Please try again.",
      409,
      ErrorCode.CONCURRENT_REDEMPTION,
      { wixCouponId }
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
    expiresAt,
    wixCouponId,
  };

  await repo.saveCoupon(coupon);

  // ── 7. Record REDEEM transaction ───────────────────────────────────────────
  // Uses finalCode as referenceId — duplicate index prevents double recording
  await ledgerService.recordRedemption(
    memberId,
    creds,
    updatedLedger.availableCreds,
    finalCode,
    wixCouponId
  );

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