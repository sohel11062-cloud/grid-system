import crypto from "crypto";

import {
  AdminAction,
  GridCampaign,
  GridMemberLedger,
} from "@/lib/grid";

import {
  getEligibleMembers,
} from "@/server/campaign-engine";

// ─────────────────────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CampaignExecutionResult {
  campaignId: string;

  totalEligible: number;
  totalRewarded: number;
  totalSkipped: number;

  totalCredsDistributed: number;

  rewardedMemberIds: string[];

  skippedMemberIds: string[];

  completedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Campaign Store
// Replace with DB later
// ─────────────────────────────────────────────────────────────────────────────

const CAMPAIGNS =
  new Map<string, GridCampaign>();

// Prevent duplicate executions

const EXECUTION_HISTORY =
  new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// Create Campaign
// ─────────────────────────────────────────────────────────────────────────────

export function createCampaign(
  input: Omit<
    GridCampaign,
    "id" | "createdAt"
  >,
): GridCampaign {
  const campaign: GridCampaign = {
    ...input,

    id:
      crypto.randomUUID(),

    createdAt:
      new Date().toISOString(),
  };

  CAMPAIGNS.set(
    campaign.id,
    campaign,
  );

  return campaign;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get Campaign
// ─────────────────────────────────────────────────────────────────────────────

export function getCampaign(
  campaignId: string,
) {
  return (
    CAMPAIGNS.get(
      campaignId,
    ) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Get All Campaigns
// ─────────────────────────────────────────────────────────────────────────────

export function listCampaigns() {
  return Array.from(
    CAMPAIGNS.values(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute Campaign
// ─────────────────────────────────────────────────────────────────────────────

export async function executeCampaign(
  campaign: GridCampaign,

  members: GridMemberLedger[],

  actor: {
    memberId: string;
    email: string;
  },
): Promise<CampaignExecutionResult> {
  const executionKey =
    `${campaign.id}:${campaign.createdAt}`;

  // Prevent duplicate runs

  if (
    EXECUTION_HISTORY.has(
      executionKey,
    )
  ) {
    throw new Error(
      "Campaign already executed.",
    );
  }

  const eligible =
    getEligibleMembers(
      members,
      campaign,
    );

  const rewarded: string[] = [];
  const skipped: string[] = [];

  let distributed = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Reward Loop
  // ─────────────────────────────────────────────────────────────────────────

  for (const member of eligible) {
    try {
      // Update balances
      // Replace with DB write later

      member.availableCreds +=
        campaign.amount;

      member.bonusCreds +=
        campaign.amount;

      member.lifetimeCreds +=
        campaign.amount;

      member.updatedAt =
        new Date().toISOString();

      rewarded.push(
        member.memberId,
      );

      distributed +=
        campaign.amount;
    } catch {
      skipped.push(
        member.memberId,
      );
    }
  }

  EXECUTION_HISTORY.add(
    executionKey,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Admin Audit Log
  // ─────────────────────────────────────────────────────────────────────────

  const audit: AdminAction = {
    id:
      crypto.randomUUID(),

    actorMemberId:
      actor.memberId,

    actorEmail:
      actor.email,

    type:
      "BONUS_CAMPAIGN",

    amount:
      campaign.amount,

    reason:
      `Campaign Execution: ${campaign.title}`,

    idempotencyKey:
      executionKey,

    metadata: {
      campaignId:
        campaign.id,

      rewarded:
        rewarded.length,

      skipped:
        skipped.length,

      totalDistributed:
        distributed,
    },

    createdAt:
      new Date().toISOString(),
  };

  console.log(
    "[GRID_CAMPAIGN_EXECUTION]",
    audit,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Return
  // ─────────────────────────────────────────────────────────────────────────

  return {
    campaignId:
      campaign.id,

    totalEligible:
      eligible.length,

    totalRewarded:
      rewarded.length,

    totalSkipped:
      skipped.length,

    totalCredsDistributed:
      distributed,

    rewardedMemberIds:
      rewarded,

    skippedMemberIds:
      skipped,

    completedAt:
      new Date().toISOString(),
  };
}