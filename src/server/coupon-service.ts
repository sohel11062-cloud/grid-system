import "server-only";

import { credsToRupees, type GridCouponRecord } from "@/lib/grid";
import { AppError, ErrorCode } from "@/server/errors";
import { MSG, logInfo, logError, logWarn } from "@/server/brand";
import { ledgerService } from "@/server/ledger-service";
import { createCouponCode } from "@/server/security";
import { assertLedgerExists, getDashboardForMember } from "@/server/grid-service";
import { getRepository } from "@/server/storage/repository";
import { createMoneyOffCoupon, isDuplicateCodeError } from "@/server/wix";

const MAX_CODE_ATTEMPTS = 3;

export async function redeemMemberCreds(
  memberId: string,
  creds:    number
): Promise<{ coupon: GridCouponRecord; dashboard: Awaited<ReturnType<typeof getDashboardForMember>> }> {

  if (!Number.isFinite(creds) || creds <= 0)
    throw new AppError(MSG.VALIDATION_ERROR, 400, ErrorCode.VALIDATION_ERROR);
  if (creds % 100 !== 0)
    throw new AppError("Redemptions must be in multiples of 100 Creds.", 400, ErrorCode.VALIDATION_ERROR);

  const repo    = getRepository();
  const ledger  = await assertLedgerExists(memberId);

  if (ledger.availableCreds < creds)
    throw new AppError(
      `${MSG.INSUFFICIENT_BALANCE} Available: ${ledger.availableCreds}, requested: ${creds}.`,
      400, ErrorCode.INSUFFICIENT_BALANCE
    );

  const rupeeInt = Math.floor(credsToRupees(creds));
  if (rupeeInt <= 0)
    throw new AppError("Coupon value must be at least ₹1.", 400, ErrorCode.VALIDATION_ERROR);

  const now       = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // ── Create coupon via reward engine (retry on duplicate code) ─────────────
  let wixCouponId: string | undefined;
  let finalCode:   string | undefined;
  let lastError:   unknown;

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = createCouponCode();
    try {
      const res  = await createMoneyOffCoupon({ code, amount: rupeeInt });
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

  if (!wixCouponId || !finalCode) {
    const failed: GridCouponRecord = {
      id: crypto.randomUUID(), memberId: ledger.memberId, contactId: ledger.contactId,
      email: ledger.email, code: finalCode ?? createCouponCode(),
      valueRupees: rupeeInt, credsSpent: creds, status: "FAILED",
      createdAt: now, expiresAt, note: MSG.COUPON_FAILED,
    };
    try { await repo.saveCoupon(failed); } catch (e) { logError(memberId, "SAVE_FAILED_COUPON", e); }
    logError(memberId, "COUPON_CREATE", lastError, { attempts: MAX_CODE_ATTEMPTS });
    throw new AppError(MSG.COUPON_FAILED, 502, ErrorCode.COUPON_CREATE_FAILED);
  }

  // ── Atomic cred deduction ─────────────────────────────────────────────────
  const updated = await repo.atomicRedemption(memberId, creds, now);
  if (!updated) {
    console.error("[GRID_COUPON] RACE_CONDITION — coupon created but deduction failed", { memberId, creds });
    throw new AppError(MSG.REDEMPTION_RACE, 409, ErrorCode.CONCURRENT_REDEMPTION);
  }

  const coupon: GridCouponRecord = {
    id: crypto.randomUUID(), memberId: updated.memberId, contactId: updated.contactId,
    email: updated.email, code: finalCode, valueRupees: rupeeInt, credsSpent: creds,
    status: "ACTIVE", createdAt: now, expiresAt, wixCouponId,
  };

  await repo.saveCoupon(coupon);
  await ledgerService.recordRedemption(memberId, creds, updated.availableCreds, finalCode, wixCouponId);

  logInfo(memberId, "REDEEM_SUCCESS", "OK", { code: finalCode, credsDeducted: creds, newBalance: updated.availableCreds });

  return { coupon, dashboard: await getDashboardForMember(memberId, false) };
}
