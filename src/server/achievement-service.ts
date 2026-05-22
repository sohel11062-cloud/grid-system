import "server-only";

import type { Achievement, GridCouponRecord, GridMemberLedger } from "@/lib/grid";

function achievement(key: string, label: string, unlockedAt: string): Achievement {
  return { key, label, unlockedAt };
}

export function deriveAchievements(
  ledger: GridMemberLedger,
  coupons: GridCouponRecord[],
): Achievement[] {
  const existing = new Map((ledger.achievements ?? []).map((a) => [a.key, a]));
  const unlocked: Achievement[] = [...existing.values()];
  const firstDate = ledger.createdAt;

  const add = (key: string, label: string, date = firstDate) => {
    if (!existing.has(key)) {
      const item = achievement(key, label, date);
      existing.set(key, item);
      unlocked.push(item);
    }
  };

  if (ledger.orderCount > 0) add("FIRST_ORDER_SYNCED", "First purchase synced");
  if (ledger.availableCreds > 0) add("CRED_WALLET_ACTIVATED", "Cred wallet activated");
  if (coupons.some((coupon) => coupon.status === "ACTIVE" || coupon.status === "USED")) {
    add("FIRST_REDEMPTION", "First reward issued", coupons[0]?.createdAt ?? firstDate);
  }
  if (ledger.lifetimeCreds >= 50_001) add("NETRUNNER_UNLOCKED", "Netrunner tier unlocked");
  if (ledger.lifetimeCreds >= 150_001) add("SYS_ADMIN_UNLOCKED", "SYS-ADMIN tier unlocked");
  if (ledger.lifetimeCreds >= 350_001) add("ARCHITECT_UNLOCKED", "THE_ARCHITECT tier unlocked");
  if (ledger.lifetimeCreds >= 1_000_001) add("SINGULARITY_UNLOCKED", "THE_SINGULARITY tier unlocked");

  return unlocked.sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
}
