import {
  GridCampaign,
  GridMemberLedger,
  GridTierKey,
} from "@/lib/grid";

// ─────────────────────────────────────────────────────────────────────────────
// Tier Matching
// ─────────────────────────────────────────────────────────────────────────────

function matchesTier(
  member: GridMemberLedger,
  tiers?: GridTierKey[],
) {
  if (!tiers || tiers.length === 0) {
    return true;
  }

  return tiers.includes(member.level);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fraud Filtering
// ─────────────────────────────────────────────────────────────────────────────

function passesFraudFilter(
  member: GridMemberLedger,
  excludeFraudHold?: boolean,
) {
  if (!excludeFraudHold) {
    return true;
  }

  return !member.fraudHold;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimum Lifetime Creds
// ─────────────────────────────────────────────────────────────────────────────

function passesLifetimeCreds(
  member: GridMemberLedger,
  minimumLifetimeCreds?: number,
) {
  if (!minimumLifetimeCreds) {
    return true;
  }

  return (
    member.lifetimeCreds >=
    minimumLifetimeCreds
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimum Orders
// ─────────────────────────────────────────────────────────────────────────────

function passesMinimumOrders(
  member: GridMemberLedger,
  minimumOrders?: number,
) {
  if (!minimumOrders) {
    return true;
  }

  return member.orderCount >= minimumOrders;
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct Targeting
// ─────────────────────────────────────────────────────────────────────────────

function matchesDirectTargets(
  member: GridMemberLedger,
  targetMemberIds?: string[],
) {
  if (
    !targetMemberIds ||
    targetMemberIds.length === 0
  ) {
    return true;
  }

  return targetMemberIds.includes(
    member.memberId,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Window
// ─────────────────────────────────────────────────────────────────────────────

function isCampaignActive(
  campaign: GridCampaign,
) {
  if (!campaign.active) {
    return false;
  }

  const now = Date.now();

  if (campaign.startAt) {
    const start = new Date(
      campaign.startAt,
    ).getTime();

    if (now < start) {
      return false;
    }
  }

  if (campaign.endAt) {
    const end = new Date(
      campaign.endAt,
    ).getTime();

    if (now > end) {
      return false;
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Segmentation Engine
// ─────────────────────────────────────────────────────────────────────────────

export function getEligibleMembers(
  members: GridMemberLedger[],
  campaign: GridCampaign,
) {
  if (!isCampaignActive(campaign)) {
    return [];
  }

  return members.filter((member) => {
    return (
      matchesTier(
        member,
        campaign.targetTiers,
      ) &&
      passesFraudFilter(
        member,
        campaign.excludeFraudHold,
      ) &&
      passesLifetimeCreds(
        member,
        campaign.minimumLifetimeCreds,
      ) &&
      passesMinimumOrders(
        member,
        campaign.minimumOrders,
      ) &&
      matchesDirectTargets(
        member,
        campaign.targetMemberIds,
      )
    );
  });
}