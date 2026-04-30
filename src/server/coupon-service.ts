import "server-only";

import { credsToRupees, type GridCouponRecord } from "@/lib/grid";
import { AppError } from "@/server/errors";
import { createCouponCode } from "@/server/security";
import { getDashboardForMember, assertLedgerExists } from "@/server/grid-service";
import { getRepository } from "@/server/storage/repository";
import { createMoneyOffCoupon } from "@/server/wix";

export async function redeemMemberCreds(memberId: string, creds: number) {
  // ── Validation ────────────────────────────────────────────────────────────
  if (!Number.isFinite(creds) || creds <= 0) {
    throw new AppError("Cred amount must be a positive integer.", 400);
  }
  if (creds % 100 !== 0) {
    throw new AppError("Redemptions must be in multiples of 100 Creds.", 400);
  }

  const repo = getRepository();
  const ledger = await assertLedgerExists(memberId);

  if (ledger.availableCreds < creds) {
    throw new AppError(
      `Insufficient balance. Available: ${ledger.availableCreds} Creds, requested: ${creds} Creds.`,
      400
    );
  }

  const valueRupees = credsToRupees(creds);
  const code = createCouponCode();
  const now = new Date().toISOString();

  // ── STEP 1: Create Wix coupon FIRST ──────────────────────────────────────
  // CRITICAL: We NEVER deduct creds until the coupon is confirmed created.
  // If creation fails, we throw — the ledger is left untouched.
  let wixCouponId: string | undefined;

  try {
    const wixResponse = await createMoneyOffCoupon({ code, amount: valueRupees });
    wixCouponId = wixResponse.coupon?.id ?? wixResponse.id;
  } catch (error) {
    // Coupon creation failed — DO NOT deduct creds.
    const msg =
      error instanceof AppError
        ? error.message
        : "Wix coupon creation failed. No Creds were deducted. " +
          "Check API key permissions (Manage Coupons) and Wix Store installation.";
    throw new AppError(msg, 502);
  }

  // ── STEP 2: Deduct creds NOW that coupon is confirmed ────────────────────
  const newRedeemedCreds = ledger.redeemedCreds + creds;
  const newAvailableCreds = Math.max(ledger.lifetimeCreds - newRedeemedCreds, 0);

  await repo.upsertMemberLedger({
    ...ledger,
    redeemedCreds: newRedeemedCreds,
    availableCreds: newAvailableCreds,
    updatedAt: now,
  });

  // ── STEP 3: Persist coupon record ────────────────────────────────────────
  const coupon: GridCouponRecord = {
    id: crypto.randomUUID(),
    memberId: ledger.memberId,
    contactId: ledger.contactId,
    email: ledger.email,
    code,
    valueRupees,
    credsSpent: creds,
    status: "ACTIVE",
    createdAt: now,
    wixCouponId,
  };

  await repo.saveCoupon(coupon);

  return {
    coupon,
    dashboard: await getDashboardForMember(memberId, false),
  };
}
