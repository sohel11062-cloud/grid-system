export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { applySecurityHeaders, handleRouteError } from "@/server/http";
import { getRepository } from "@/server/storage/repository";
import type { WeeklyReport, WeeklyReportUser } from "@/lib/grid";

function assertSecret(req: NextRequest) {
  const env   = getEnv();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
    || (req.headers.get("x-cron-secret") ?? "").trim();
  if (!token || token !== env.CRON_SECRET)
    throw new AppError("Unauthorized.", 401, ErrorCode.AUTH_REQUIRED);
}

export async function GET(request: NextRequest) {
  try {
    assertSecret(request);

    const repo      = getRepository();
    const now       = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const memberIds = await repo.getAllMemberIds();

    const rows: WeeklyReportUser[] = [];
    const BATCH = 20;

    for (let i = 0; i < memberIds.length; i += BATCH) {
      const results = await Promise.allSettled(
        memberIds.slice(i, i + BATCH).map(async (memberId) => {
          const [ledger, txSum, cpnSum] = await Promise.all([
            repo.getMemberLedger(memberId),
            repo.getTransactionSummary(memberId, weekStart),
            repo.getCouponSummary(memberId),
          ]);
          if (!ledger) return null;
          return {
            memberId, name: ledger.username, email: ledger.email,
            balance: ledger.availableCreds,
            earnedThisWeek:   txSum.earned,
            redeemedThisWeek: txSum.redeemed,
            couponsCreated:   cpnSum.total - cpnSum.failed,
            couponsUsed:      cpnSum.used,
            couponsActive:    cpnSum.active,
            couponsExpired:   cpnSum.expired,
            savings:          cpnSum.totalSavingsRupees,
            rank:             0,
          } satisfies Omit<WeeklyReportUser, "rank"> & { rank: number };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) rows.push(r.value as WeeklyReportUser);
      }
    }

    rows.sort((a, b) => b.savings !== a.savings ? b.savings - a.savings : b.earnedThisWeek - a.earnedThisWeek);
    rows.forEach((u, i) => { u.rank = i + 1; });

    const totalCouponsCreated = rows.reduce((s, u) => s + u.couponsCreated, 0);
    const totalCouponsUsed    = rows.reduce((s, u) => s + u.couponsUsed,    0);

    const report: WeeklyReport = {
      generatedAt: now.toISOString(),
      weekStart:   weekStart.toISOString(),
      weekEnd:     now.toISOString(),
      users:       rows,
      summary: {
        totalActiveUsers:    rows.filter((u) => u.earnedThisWeek > 0 || u.redeemedThisWeek > 0).length,
        totalTransactions:   rows.reduce((s, u) => s + (u.earnedThisWeek > 0 || u.redeemedThisWeek > 0 ? 1 : 0), 0),
        totalCouponsCreated,
        totalCouponsUsed,
        conversionRatePct:   totalCouponsCreated > 0 ? Math.round(totalCouponsUsed / totalCouponsCreated * 100) : 0,
        totalSavingsRupees:  rows.reduce((s, u) => s + u.savings, 0),
        topUsers:            rows.slice(0, 10),
      },
    };

    const response = NextResponse.json({ success: true, report });
    applySecurityHeaders(response);
    return response;
  } catch (error) { return handleRouteError(error); }
}
