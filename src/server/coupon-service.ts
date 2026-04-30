import "server-only";

import { credsToRupees, type GridCouponRecord } from "@/lib/grid";
import { AppError } from "@/server/errors";
import { createCouponCode } from "@/server/security";
import { getDashboardForMember, assertLedgerExists } from "@/server/grid-service";
import { getRepository } from "@/server/storage/repository";
import { createMoneyOffCoupon } from "@/server/wix";

export async function redeemMemberCreds(memberId: string, creds: number) {
  if (!Number.isFinite(creds) || creds <= 0) {
    throw new AppError("Cred amount must be a positive number.", 400);
  }

  if (creds % 100 !== 0) {
    throw new AppError("Redemptions must be made in 100 Cred increments.", 400);
  }

  const repo = getRepository();
  const ledger = await assertLedgerExists(memberId);

  if (ledger.availableCreds < creds) {
    throw new AppError("Insufficient Cred balance for this redemption.", 400);
  }

  const valueRupees = credsToRupees(creds);
  const code = createCouponCode();
  const now = new Date().toISOString();
  let status: GridCouponRecord["status"] = "ACTIVE";
  let note: string | undefined;
  let wixCouponId: string | undefined;

  try {
    const wixCoupon = await createMoneyOffCoupon({
      code,
      amount: valueRupees
    });
    wixCouponId = wixCoupon.id ?? wixCoupon.coupon?.id;
  } catch (error) {
    status = "LOCAL_ONLY";
    note = "Wix coupon creation failed. Check coupon permissions, Stores install state, and coupon scope.";
    console.error("[THE_GRID_COUPON_FALLBACK]", error);
  }

  const coupon: GridCouponRecord = {
    id: crypto.randomUUID(),
    memberId: ledger.memberId,
    contactId: ledger.contactId,
    email: ledger.email,
    code,
    valueRupees,
    credsSpent: creds,
    status,
    createdAt: now,
    wixCouponId,
    note
  };

  await repo.upsertMemberLedger({
    ...ledger,
    redeemedCreds: ledger.redeemedCreds + creds,
    availableCreds: Math.max(ledger.availableCreds - creds, 0),
    updatedAt: now
  });

  await repo.saveCoupon(coupon);

  return {
    coupon,
    dashboard: await getDashboardForMember(memberId, false)
  };
}
