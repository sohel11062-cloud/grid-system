// ─── Transaction types ────────────────────────────────────────────────────────

export type CreditTransactionType   = "EARN" | "REDEEM" | "BONUS" | "ADJUSTMENT";
export type CreditTransactionSource = "ORDER" | "COUPON" | "ADMIN" | "SYSTEM";

export interface CreditTransaction {
  id:           string;
  memberId:     string;
  type:         CreditTransactionType;
  amount:       number;
  balanceAfter: number;
  source:       CreditTransactionSource;
  referenceId:  string;
  description?: string;
  metadata?:    Record<string, unknown>;
  createdAt:    string;
}

// ─── Tier types ───────────────────────────────────────────────────────────────

export type GridTierKey =
  | "THE_GLITCH"
  | "NETRUNNER"
  | "SYS-ADMIN"
  | "THE_ARCHITECT"
  | "THE_SINGULARITY";

export interface GridTier {
  key:    GridTierKey;
  min:    number;
  max:    number | null;
  label:  string;
  mantra: string;
}

// ─── Order types ──────────────────────────────────────────────────────────────

export interface OrderHistory {
  orderId:     string;
  memberId:    string;
  amount:      number;
  currency:    string;
  couponCode?: string;
  credsEarned: number;
  createdAt:   string;
  syncedAt:    string;
}

export interface GridOrderSummary {
  id:            string;
  number:        string;
  total:         number;
  currency:      string;
  purchasedDate: string | null;
  status:        string;
  paymentStatus: string;
  items:         string[];
  couponCode?:   string;
}

// ─── Coupon types ─────────────────────────────────────────────────────────────

export type GridCouponStatus = "ACTIVE" | "USED" | "EXPIRED" | "FAILED";

export interface GridCouponRecord {
  id:           string;
  memberId:     string;
  contactId:    string | null;
  email:        string;
  code:         string;
  valueRupees:  number;
  credsSpent:   number;
  status:       GridCouponStatus;
  createdAt:    string;
  expiresAt?:   string;
  usedAt?:      string;
  orderId?:     string;
  wixCouponId?: string;
  note?:        string;
}

// ─── Ledger types ─────────────────────────────────────────────────────────────

export interface GridMemberLedger {
  memberId:              string;
  contactId:             string | null;
  email:                 string;
  username:              string;
  birthdayMonthDay:      string | null;
  welcomeBonusGrantedAt: string | null;
  birthdayBonusYears:    number[];
  totalPurchaseValue:    number;
  purchaseCreds:         number;
  bonusCreds:            number;
  lifetimeCreds:         number;
  redeemedCreds:         number;
  availableCreds:        number;
  level:                 GridTierKey;
  orderCount:            number;
  orders:                GridOrderSummary[];
  createdAt:             string;
  updatedAt:             string;
  syncedAt:              string;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface GridLeaderboardEntry {
  memberId:      string;
  username:      string;
  level:         GridTierKey;
  lifetimeCreds: number;
}

// ─── Lifetime stats ───────────────────────────────────────────────────────────

export interface LifetimeStats {
  totalSavingsRupees:  number;
  totalCouponsUsed:    number;
  totalCouponsActive:  number;
  totalCouponsExpired: number;
}

// ─── User stats ───────────────────────────────────────────────────────────────

export interface UserStats {
  memberId:               string;
  username:               string;
  email:                  string;
  currentBalance:         number;
  totalCredsEarned:       number;
  totalCredsRedeemed:     number;
  totalCouponsGenerated:  number;
  totalCouponsUsed:       number;
  totalCouponsActive:     number;
  totalCouponsExpired:    number;
  totalSavingsRupees:     number;
}

// ─── Weekly report ────────────────────────────────────────────────────────────

export interface WeeklyReportUser {
  memberId:         string;
  name:             string;
  email:            string;
  balance:          number;
  earnedThisWeek:   number;
  redeemedThisWeek: number;
  couponsCreated:   number;
  couponsUsed:      number;
  couponsActive:    number;
  couponsExpired:   number;
  savings:          number;
  rank:             number;
}

export interface WeeklyReport {
  generatedAt: string;
  weekStart:   string;
  weekEnd:     string;
  users:       WeeklyReportUser[];
  summary: {
    totalActiveUsers:    number;
    totalTransactions:   number;
    totalCouponsCreated: number;
    totalCouponsUsed:    number;
    conversionRatePct:   number;
    totalSavingsRupees:  number;
    topUsers:            WeeklyReportUser[];
  };
}

// ─── Dashboard payload ────────────────────────────────────────────────────────

export interface GridDashboardData {
  member: {
    memberId:  string;
    contactId: string | null;
    username:  string;
    email:     string;
  };
  wallet: {
    totalPurchaseValue: number;
    purchaseCreds:      number;
    bonusCreds:         number;
    lifetimeCreds:      number;
    redeemedCreds:      number;
    availableCreds:     number;
    level:              GridTier;
    nextLevel:          GridTier | null;
    progressRatio:      number;
    credsToNextLevel:   number;
  };
  orders:             GridOrderSummary[];
  coupons:            GridCouponRecord[];
  leaderboard:        GridLeaderboardEntry[];
  recentTransactions: CreditTransaction[];
  lifetimeStats:      LifetimeStats;
  system: {
    syncWindowLabel: string;
    syncedAt:        string;
    connection:      "ONLINE" | "DEGRADED";
  };
}

// ─── Tier definitions ─────────────────────────────────────────────────────────

export const GRID_TIERS: GridTier[] = [
  {
    key:    "THE_GLITCH",
    min:    0,
    max:    50_000,
    label:  "THE_GLITCH",
    mantra: "Entry node. Signal unstable.",
  },
  {
    key:    "NETRUNNER",
    min:    50_001,
    max:    150_000,
    label:  "NETRUNNER",
    mantra: "Network access expanded.",
  },
  {
    key:    "SYS-ADMIN",
    min:    150_001,
    max:    350_000,
    label:  "SYS-ADMIN",
    mantra: "Privilege escalation complete.",
  },
  {
    key:    "THE_ARCHITECT",
    min:    350_001,
    max:    1_000_000,
    label:  "THE_ARCHITECT",
    mantra: "Reality edit access enabled.",
  },
  {
    key:    "THE_SINGULARITY",
    min:    1_000_001,
    max:    null,
    label:  "THE_SINGULARITY",
    mantra: "System and self are one.",
  },
];

// ─── Tier helpers ─────────────────────────────────────────────────────────────

export function getGridTier(creds: number): GridTier {
  return (
    [...GRID_TIERS].reverse().find((t) => creds >= t.min) ?? GRID_TIERS[0]
  );
}

export function getNextGridTier(creds: number): GridTier | null {
  const idx = GRID_TIERS.findIndex((t) => t.key === getGridTier(creds).key);
  return idx === -1 || idx === GRID_TIERS.length - 1
    ? null
    : GRID_TIERS[idx + 1];
}

export function getGridProgress(
  creds: number,
): { ratio: number; remaining: number } {
  const current = getGridTier(creds);
  const next    = getNextGridTier(creds);
  if (!next || current.max === null) return { ratio: 1, remaining: 0 };
  const span       = next.min - current.min;
  const progressed = creds - current.min;
  return {
    ratio:     Math.min(Math.max(progressed / span, 0), 1),
    remaining: Math.max(next.min - creds, 0),
  };
}

// ─── Credit helpers ───────────────────────────────────────────────────────────

/** ₹1 spent = 1 Cred */
export function rupeesToCreds(rupees: number): number {
  return Math.max(Math.floor(rupees), 0);
}

/** 100 Creds = ₹1 */
export function credsToRupees(creds: number): number {
  return Math.max(Number((creds / 100).toFixed(2)), 0);
}

/**
 * Safely normalises a monetary amount from any API response shape.
 * Handles strings like "1500.00", numbers, null, and undefined.
 */
export function normaliseAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatIndianCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style:                 "currency",
    currency:              "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}