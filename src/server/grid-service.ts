import "server-only";

import {
  formatIndianCurrency,
  getGridProgress,
  getGridTier,
  normaliseAmount,
  rupeesToCreds,
  type GridCouponRecord,
  type GridDashboardData,
  type GridMemberLedger,
  type GridOrderSummary
} from "@/lib/grid";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { getRepository } from "@/server/storage/repository";
import {
  getContactById,
  getMemberById,
  queryAllMembers,
  searchOrdersByIdentity,
  type WixContact,
  type WixMember,
  type WixOrder
} from "@/server/wix";

function getTodayMonthDay() {
  const now = new Date();
  return `${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function extractBirthdayMonthDay(contact: WixContact | null) {
  const birthdate = contact?.info?.birthdate;

  if (!birthdate) {
    return null;
  }

  const [year, month, day] = birthdate.split("-");
  if (!year || !month || !day) {
    return null;
  }

  return `${month}-${day}`;
}

function resolveUsername(member: WixMember, contact: WixContact | null) {
  const first = member.contact?.firstName ?? contact?.info?.name?.first;
  const last = member.contact?.lastName ?? contact?.info?.name?.last;
  const fullName = [first, last].filter(Boolean).join(" ");

  return member.profile?.nickname || fullName || member.loginEmail || "UNKNOWN_USER";
}

function isEligibleOrder(order: WixOrder) {
  const status = order.status?.toUpperCase();
  const paymentStatus = order.paymentStatus?.toUpperCase();

  if (status === "CANCELED" || status === "INITIALIZED") {
    return false;
  }

  if (paymentStatus === "NOT_PAID" || paymentStatus === "UNPAID") {
    return false;
  }

  return true;
}

function toOrderSummary(order: WixOrder): GridOrderSummary {
  return {
    id: order.id,
    number: order.number ?? order.id,
    total: normaliseAmount(order.priceSummary?.total?.amount),
    currency: order.priceSummary?.total?.currency ?? "INR",
    purchasedDate: order.purchasedDate ?? null,
    status: order.status ?? "UNKNOWN",
    paymentStatus: order.paymentStatus ?? "UNKNOWN",
    items:
      order.lineItems?.map((item) => item.productName?.original).filter((name): name is string => Boolean(name)) ??
      []
  };
}

function isLedgerStale(ledger: GridMemberLedger) {
  const env = getEnv();
  return Date.now() - new Date(ledger.syncedAt).getTime() > env.SYNC_STALE_HOURS * 60 * 60 * 1000;
}

function toDashboardData(
  ledger: GridMemberLedger,
  coupons: GridCouponRecord[],
  leaderboard: Awaited<ReturnType<ReturnType<typeof getRepository>["listTopMembers"]>>
): GridDashboardData {
  const currentTier = getGridTier(ledger.lifetimeCreds);
  const progress = getGridProgress(ledger.lifetimeCreds);
  const nextTier = progress.remaining > 0 ? getGridTier(ledger.lifetimeCreds + progress.remaining) : null;

  return {
    member: {
      memberId: ledger.memberId,
      contactId: ledger.contactId,
      username: ledger.username,
      email: ledger.email
    },
    wallet: {
      totalPurchaseValue: ledger.totalPurchaseValue,
      purchaseCreds: ledger.purchaseCreds,
      bonusCreds: ledger.bonusCreds,
      lifetimeCreds: ledger.lifetimeCreds,
      redeemedCreds: ledger.redeemedCreds,
      availableCreds: ledger.availableCreds,
      level: currentTier,
      nextLevel: nextTier,
      progressRatio: progress.ratio,
      credsToNextLevel: progress.remaining
    },
    orders: ledger.orders,
    coupons,
    leaderboard,
    system: {
      syncWindowLabel: "24-48 hrs",
      syncedAt: ledger.syncedAt,
      connection: "ONLINE"
    }
  };
}

export async function syncMemberById(memberId: string) {
  const env = getEnv();
  const repo = getRepository();
  const existing = await repo.getMemberLedger(memberId);

  const member = await getMemberById(memberId);
  const contact = member.contactId ? await getContactById(member.contactId) : null;
  const rawOrders = await searchOrdersByIdentity({
    memberId,
    contactId: member.contactId,
    email: member.loginEmail
  });

  const orders = rawOrders.filter(isEligibleOrder).map(toOrderSummary);
  const totalPurchaseValue = orders.reduce((sum, order) => sum + order.total, 0);
  const purchaseCreds = rupeesToCreds(totalPurchaseValue);

  let bonusCreds = existing?.bonusCreds ?? 0;
  let welcomeBonusGrantedAt = existing?.welcomeBonusGrantedAt ?? null;
  let birthdayBonusYears = existing?.birthdayBonusYears ?? [];

  if (!welcomeBonusGrantedAt) {
    welcomeBonusGrantedAt = new Date().toISOString();
    bonusCreds += env.WELCOME_BONUS_CREDITS;
  }

  const birthdayMonthDay = extractBirthdayMonthDay(contact);
  const currentYear = new Date().getUTCFullYear();

  if (birthdayMonthDay && birthdayMonthDay === getTodayMonthDay() && !birthdayBonusYears.includes(currentYear)) {
    birthdayBonusYears = [...birthdayBonusYears, currentYear];
    bonusCreds += env.BIRTHDAY_BONUS_CREDITS;
  }

  const lifetimeCreds = purchaseCreds + bonusCreds;
  const redeemedCreds = existing?.redeemedCreds ?? 0;
  const availableCreds = Math.max(lifetimeCreds - redeemedCreds, 0);
  const now = new Date().toISOString();

  const ledger: GridMemberLedger = {
    memberId,
    contactId: member.contactId ?? null,
    email: member.loginEmail ?? existing?.email ?? contact?.primaryInfo?.email ?? "",
    username: resolveUsername(member, contact),
    birthdayMonthDay,
    welcomeBonusGrantedAt,
    birthdayBonusYears,
    totalPurchaseValue,
    purchaseCreds,
    bonusCreds,
    lifetimeCreds,
    redeemedCreds,
    availableCreds,
    level: getGridTier(lifetimeCreds).key,
    orderCount: orders.length,
    orders: orders.slice(0, 8),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncedAt: now
  };

  await repo.upsertMemberLedger(ledger);
  return ledger;
}

export async function getDashboardForMember(memberId: string, forceSync = false) {
  const repo = getRepository();
  let ledger = await repo.getMemberLedger(memberId);

  if (!ledger || forceSync || isLedgerStale(ledger)) {
    ledger = await syncMemberById(memberId);
  }

  const [coupons, leaderboard] = await Promise.all([
    repo.listCouponsByMember(memberId, 6),
    repo.listTopMembers(5)
  ]);

  return toDashboardData(ledger, coupons, leaderboard);
}

export async function syncAllMembers() {
  const members = await queryAllMembers();
  let synced = 0;
  let failed = 0;

  for (const member of members) {
    try {
      await syncMemberById(member.id);
      synced += 1;
    } catch (error) {
      failed += 1;
      console.error("[THE_GRID_SYNC_MEMBER_FAILED]", member.id, error);
    }
  }

  return {
    total: members.length,
    synced,
    failed
  };
}

export async function assertLedgerExists(memberId: string) {
  const repo = getRepository();
  const ledger = await repo.getMemberLedger(memberId);

  if (!ledger) {
    throw new AppError(
      `No loyalty ledger exists for this member yet. Run a sync first before calculating ${formatIndianCurrency(0)} rewards.`,
      404
    );
  }

  return ledger;
}
