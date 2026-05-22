export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getEnv }              from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { applySecurityHeaders, handleRouteError } from "@/server/http";
import { getRepository }       from "@/server/storage/repository";

function assertCronSecret(req: NextRequest): void {
  const { CRON_SECRET } = getEnv();
  const token =
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() ||
    (req.headers.get("x-cron-secret") ?? "").trim();
  if (!token || token !== CRON_SECRET)
    throw new AppError("Unauthorized.", 401, ErrorCode.AUTH_REQUIRED);
}

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(request);

    const repo      = getRepository();
    const memberIds = await repo.getAllMemberIds();
    const mismatches: unknown[] = [];
    const BATCH = 25;

    for (let i = 0; i < memberIds.length; i += BATCH) {
      await Promise.allSettled(
        memberIds.slice(i, i + BATCH).map(async (memberId) => {
          const [ledger, txs] = await Promise.all([
            repo.getMemberLedger(memberId),
            repo.listCreditTransactions(memberId, { limit: 100_000 }),
          ]);
          if (!ledger) return;

          let earned = 0, redeemed = 0, bonus = 0;
          for (const tx of txs) {
            if (tx.type === "EARN")   earned   += tx.amount;
            if (tx.type === "REDEEM") redeemed += tx.amount;
            if (tx.type === "BONUS")  bonus    += tx.amount;
          }

          const computedAvailable = Math.max(earned + bonus - redeemed, 0);
          const delta = ledger.availableCreds - computedAvailable;

          if (Math.abs(delta) > 0) {
            const mismatch = {
              memberId,
              storedAvailable:   ledger.availableCreds,
              computedAvailable,
              delta,
            };
            mismatches.push(mismatch);
            console.error("[GRID_RECONCILE] Mismatch:", mismatch);
          }
        }),
      );
    }

    const response = NextResponse.json({
      success:      true,
      checkedAt:    new Date().toISOString(),
      totalChecked: memberIds.length,
      mismatchCount: mismatches.length,
      healthy:      mismatches.length === 0,
      mismatches,
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) { return handleRouteError(error); }
}
