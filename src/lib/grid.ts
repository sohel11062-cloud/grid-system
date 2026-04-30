export type GridTierKey =
  | "THE_GLITCH"
  | "NETRUNNER"
  | "SYS-ADMIN"
  | "THE_ARCHITECT"
  | "THE_SINGULARITY";

export interface GridTier {
  key: GridTierKey;
  min: number;
  max: number | null;
  label: string;
  mantra: string;
}

export interface GridOrderSummary {
  id: string;
  number: string;
  total: number;
  currency: string;
  purchasedDate: string | null;
  status: string;
  paymentStatus: string;
  items: string[];
}

// Added FAILED — coupons where Wix creation failed (creds were NOT deducted)
export type GridCouponStatus = "ACTIVE" | "REDEEMED" | "EXPIRED" | "LOCAL_ONLY" | "FAILED";

export interface GridCouponRecord {
  id: string;
  memberId: string;
  contactId: string | null;
  email: string;
  code: string;
  valueRupees: number;
  credsSpent: number;
  status: GridCouponStatus;
  createdAt: string;
  wixCouponId?: string;
  note?: string;
}

export interface GridMemberLedger {
  memberId: string;
  contactId: string | null;
  email: string;
  username: string;
  birthdayMonthDay: string | null;
  welcomeBonusGrantedAt: string | null;
  birthdayBonusYears: number[];
  totalPurchaseValue: number;
  purchaseCreds: number;
  bonusCreds: number;
  lifetimeCreds: number;
  redeemedCreds: number;
  availableCreds: number;
  level: GridTierKey;
  orderCount: number;
  orders: GridOrderSummary[];
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
}

export interface GridLeaderboardEntry {
  memberId: string;
  username: string;
  level: GridTierKey;
  lifetimeCreds: number;
}

export interface GridDashboardData {
  member: {
    memberId: string;
    contactId: string | null;
    username: string;
    email: string;
  };
  wallet: {
    totalPurchaseValue: number;
    purchaseCreds: number;
    bonusCreds: number;
    lifetimeCreds: number;
    redeemedCreds: number;
    availableCreds: number;
    level: GridTier;
    nextLevel: GridTier | null;
    progressRatio: number;
    credsToNextLevel: number;
  };
  orders: GridOrderSummary[];
  coupons: GridCouponRecord[];
  leaderboard: GridLeaderboardEntry[];
  system: {
    syncWindowLabel: string;
    syncedAt: string;
    connection: "ONLINE" | "DEGRADED";
  };
}

export const GRID_TIERS: GridTier[] = [
  { key: "THE_GLITCH",      min: 0,       max: 50000,   label: "THE_GLITCH",      mantra: "Entry node. Signal unstable." },
  { key: "NETRUNNER",       min: 50001,   max: 150000,  label: "NETRUNNER",       mantra: "Network access expanded." },
  { key: "SYS-ADMIN",       min: 150001,  max: 350000,  label: "SYS-ADMIN",       mantra: "Privilege escalation complete." },
  { key: "THE_ARCHITECT",   min: 350001,  max: 1000000, label: "THE_ARCHITECT",   mantra: "Reality edit access enabled." },
  { key: "THE_SINGULARITY", min: 1000001, max: null,    label: "THE_SINGULARITY", mantra: "System and self are one." },
];

export function getGridTier(creds: number): GridTier {
  return (
    GRID_TIERS.find((t) => creds >= t.min && (t.max === null || creds <= t.max)) ??
    GRID_TIERS[0]
  );
}

export function getNextGridTier(creds: number): GridTier | null {
  const idx = GRID_TIERS.findIndex((t) => t.key === getGridTier(creds).key);
  return idx === -1 || idx === GRID_TIERS.length - 1 ? null : GRID_TIERS[idx + 1];
}

export function getGridProgress(creds: number) {
  const current = getGridTier(creds);
  const next = getNextGridTier(creds);
  if (!next || current.max === null) return { ratio: 1, remaining: 0 };
  const span = next.min - current.min;
  const progressed = creds - current.min;
  return {
    ratio: Math.min(Math.max(progressed / span, 0), 1),
    remaining: Math.max(next.min - creds, 0),
  };
}

export function rupeesToCreds(rupees: number): number {
  return Math.max(Math.round(rupees), 0);
}

export function credsToRupees(creds: number): number {
  return Math.max(Number((creds / 100).toFixed(2)), 0);
}

export function normaliseAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatIndianCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
