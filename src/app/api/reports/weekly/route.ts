export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { AppError, ErrorCode } from "@/server/errors";
import { handleRouteError, applySecurityHeaders } from "@/server/http";
import { getRepository } from "@/server/storage/repository";
import type { WeeklyReport, WeeklyReportUser } from "@/lib/grid";

/**
 * Weekly report endpoint.
 * Secured with cron secret — called by Vercel Cron weekly.
 * Can also be called manually for on-demand reporting.
 *
 * GET /api/reports/weekly
 * Authorization: Bearer <CRON_SECRET>
 */

function assertCronSecret(request: NextRequest): void {
  const env   = getEnv();
  const auth  = request.headers.get("authorization") ?? "";
  const token =
    auth.replace(/^Bearer\s+/i, "").trim() ||
    (request.headers.get("x-cron-secret") ?? "").trim();

  if (!token || token !== env.CRON_SECRET) {
    throw new AppError("Unauthorized.", 401, ErrorCode.AUTH_REQUIRED);
  }
}

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(request);

    const repo      = getRepository();
    const now       = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    console.info("[THE_GRID_WEEKLY_REPORT] Generating report for", {
      weekStart: weekStart.toISOString(),
      weekEnd:   now.toISOString(),
    });

    // ── 1. Get all member IDs ──────────────────────────────────────────────
    const memberIds = await repo.getAllMemberIds();

    if (memberIds.length === 0) {
      const emptyReport: WeeklyReport = {
        generatedAt: now.toISOString(),
        weekStart:   weekStart.toISOString(),
        weekEnd:     now.toISOString(),
        users:       [],
        summary: {
          totalActiveUsers:    0,
          totalTransactions:   0,
          totalCouponsCreated: 0,
          totalCouponsUsed:    0,
          conversionRatePct:   0,
          totalSavingsRupees:  0,
          topUsers:            [],
        },
      };
      const response = NextResponse.json({ success: true, report: emptyReport });
      applySecurityHeaders(response);
      return response;
    }

    // ── 2. Build per-user stats (batched) ──────────────────────────────────
    const userRows: WeeklyReportUser[] = [];

    // Process in parallel batches of 20 to avoid overwhelming MongoDB
    const BATCH_SIZE = 20;
    for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
      const batch = memberIds.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (memberId) => {
          const [ledger, txSummary, couponSummary] = await Promise.all([
            repo.getMemberLedger(memberId),
            repo.getTransactionSummary(memberId, weekStart),
            repo.getCouponSummary(memberId),
          ]);

          if (!ledger) return null;

          return {
            memberId,
            name:               ledger.username,
            email:              ledger.email,
            balance:            ledger.availableCreds,
            earnedThisWeek:     txSummary.earned,
            redeemedThisWeek:   txSummary.redeemed,
            couponsCreated:     couponSummary.total - couponSummary.failed,
            couponsUsed:        couponSummary.used,
            couponsActive:      couponSummary.active,
            couponsExpired:     couponSummary.expired,
            savings:            couponSummary.totalSavingsRupees,
            rank:               0, // assigned after sort
          } satisfies Omit<WeeklyReportUser, "rank"> & { rank: number };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          userRows.push(result.value as WeeklyReportUser);
        }
      }
    }

    // ── 3. Rank by savings (lifetime), then by earned this week ───────────
    userRows.sort((a, b) => {
      if (b.savings !== a.savings) return b.savings - a.savings;
      return b.earnedThisWeek - a.earnedThisWeek;
    });
    userRows.forEach((u, idx) => { u.rank = idx + 1; });

    // ── 4. System-wide summary ─────────────────────────────────────────────
    const totalCouponsCreated = userRows.reduce((s, u) => s + u.couponsCreated, 0);
    const totalCouponsUsed    = userRows.reduce((s, u) => s + u.couponsUsed, 0);
    const totalTransactions   = userRows.reduce(
      (s, u) => s + (u.earnedThisWeek > 0 || u.redeemedThisWeek > 0 ? 1 : 0), 0
    );
    const totalSavings        = userRows.reduce((s, u) => s + u.savings, 0);
    const activeThisWeek      = userRows.filter(
      (u) => u.earnedThisWeek > 0 || u.redeemedThisWeek > 0
    ).length;

    const report: WeeklyReport = {
      generatedAt: now.toISOString(),
      weekStart:   weekStart.toISOString(),
      weekEnd:     now.toISOString(),
      users:       userRows,
      summary: {
        totalActiveUsers:    activeThisWeek,
        totalTransactions,
        totalCouponsCreated,
        totalCouponsUsed,
        conversionRatePct:   totalCouponsCreated > 0
          ? Math.round((totalCouponsUsed / totalCouponsCreated) * 100)
          : 0,
        totalSavingsRupees:  totalSavings,
        topUsers:            userRows.slice(0, 10),
      },
    };

    console.info("[THE_GRID_WEEKLY_REPORT] Complete:", {
      memberCount:  memberIds.length,
      activeUsers:  activeThisWeek,
      totalSavings,
    });

    const response = NextResponse.json({ success: true, report });
    applySecurityHeaders(response);
    return response;

  } catch (error) {
    return handleRouteError(error);
  }
}