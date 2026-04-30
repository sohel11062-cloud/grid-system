import "server-only";

import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface WixMember {
  id: string;
  contactId?: string;
  loginEmail?: string;
  profile?: { nickname?: string };
  contact?: { firstName?: string; lastName?: string };
}

export interface WixContact {
  id: string;
  primaryInfo?: { email?: string };
  info?: {
    birthdate?: string;
    name?: { first?: string; last?: string };
  };
}

export interface WixOrder {
  id: string;
  number?: string;
  status?: string;
  paymentStatus?: string;
  purchasedDate?: string;
  priceSummary?: {
    total?: { amount?: string | number; currency?: string };
  };
  lineItems?: Array<{ productName?: { original?: string } }>;
}

interface WixCouponResponse {
  coupon?: { id?: string; specification?: Record<string, unknown> };
}

type JsonObject = Record<string, unknown>;

// ─── Internal helpers ────────────────────────────────────────────────────────

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: unknown = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message =
      json &&
      typeof json === "object" &&
      "message" in json &&
      typeof (json as Record<string, unknown>).message === "string"
        ? ((json as Record<string, unknown>).message as string)
        : `Wix API request failed — HTTP ${response.status}`;

    console.error("[THE_GRID_WIX_API_ERROR]", {
      status: response.status,
      url: response.url,
      body: json,
    });

    throw new AppError(message, response.status, json);
  }

  return (json ?? {}) as T;
}

async function wixRequest<T>(
  url: string,
  options: RequestInit & { auth?: "api-key"; bodyJson?: JsonObject }
): Promise<T> {
  const env = getEnv();
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (options.bodyJson) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth === "api-key") {
    headers.set("Authorization", env.WIX_API_KEY);
    headers.set("wix-site-id", env.WIX_SITE_ID);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
    body: options.bodyJson ? JSON.stringify(options.bodyJson) : options.body,
  });

  return parseJsonResponse<T>(response);
}

// ─── Members ─────────────────────────────────────────────────────────────────

/**
 * GET /members/v1/members/{memberId}
 * Response shape: { member: { id, loginEmail, contactId, profile, contact } }
 */
export async function getMemberById(memberId: string): Promise<WixMember> {
  const env = getEnv();

  const response = await wixRequest<{ member: WixMember }>(
    `${env.WIX_MEMBERS_ENDPOINT}/${memberId}`,
    { method: "GET", auth: "api-key" }
  );

  if (!response.member) {
    throw new AppError(`Wix returned no member for id ${memberId}`, 404);
  }

  return response.member;
}

/**
 * POST /members/v1/members/query
 * Response shape: { members: [...], pagingMetadata: { ... } }
 */
export async function queryAllMembers(): Promise<WixMember[]> {
  const env = getEnv();
  const all: WixMember[] = [];
  const LIMIT = 100;
  let offset = 0;

  for (;;) {
    const response = await wixRequest<{
      members?: WixMember[];
      pagingMetadata?: { count?: number; total?: number };
    }>(env.WIX_MEMBERS_QUERY_ENDPOINT, {
      method: "POST",
      auth: "api-key",
      bodyJson: { paging: { limit: LIMIT, offset } },
    });

    const batch = response.members ?? [];
    all.push(...batch);

    if (batch.length < LIMIT) break;
    offset += LIMIT;
  }

  return all;
}

// ─── Contacts ────────────────────────────────────────────────────────────────

/**
 * GET /contacts/v4/contacts/{contactId}
 * Response shape: { contact: { id, primaryInfo, info } }
 */
export async function getContactById(contactId: string): Promise<WixContact> {
  const env = getEnv();

  const response = await wixRequest<{ contact: WixContact }>(
    `${env.WIX_CONTACTS_ENDPOINT}/${contactId}`,
    { method: "GET", auth: "api-key" }
  );

  if (!response.contact) {
    throw new AppError(`Wix returned no contact for id ${contactId}`, 404);
  }

  return response.contact;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

/**
 * POST /ecom/v1/orders/search
 * Response shape: { orders: [...] }
 *
 * We build an $or filter across all known identifiers so that
 * orders are found regardless of which identity Wix attached.
 */
export async function searchOrdersByIdentity(identity: {
  memberId?: string | null;
  contactId?: string | null;
  email?: string | null;
}): Promise<WixOrder[]> {
  const env = getEnv();

  // Build OR filter over all available identifiers.
  const conditions: JsonObject[] = [];

  if (identity.memberId) {
    conditions.push({ "buyerInfo.memberId": { $eq: identity.memberId } });
  }
  if (identity.contactId) {
    conditions.push({ "buyerInfo.contactId": { $eq: identity.contactId } });
  }
  if (identity.email) {
    conditions.push({ "buyerInfo.email": { $eq: identity.email } });
  }

  if (conditions.length === 0) return [];

  const filter: JsonObject =
    conditions.length === 1 ? conditions[0] : { $or: conditions };

  const response = await wixRequest<{ orders?: WixOrder[] }>(
    env.WIX_ORDERS_SEARCH_ENDPOINT,
    {
      method: "POST",
      auth: "api-key",
      bodyJson: {
        filter,
        sort: [{ fieldName: "purchasedDate", order: "DESC" }],
        cursorPaging: { limit: 100 },
      },
    }
  );

  return response.orders ?? [];
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

/**
 * POST /stores/v2/coupons
 * Requires API-key scope: Manage Coupons
 *
 * Response shape: { coupon: { id, specification, ... } }
 */
export async function createMoneyOffCoupon(input: {
  code: string;
  amount: number;
}): Promise<WixCouponResponse> {
  const env = getEnv();

  const specification: JsonObject = {
    name: `THE GRID — ${input.amount} INR REWARD`,
    code: input.code,
    startTime: new Date().toISOString(),
    moneyOffAmount: input.amount,
  };

  // Only add store scope when the namespace is explicitly set and not "none".
  if (
    env.GRID_COUPON_SCOPE_NAMESPACE &&
    env.GRID_COUPON_SCOPE_NAMESPACE !== "none"
  ) {
    specification.scope = { namespace: env.GRID_COUPON_SCOPE_NAMESPACE };
  }

  try {
    const response = await wixRequest<WixCouponResponse>(
      env.WIX_COUPONS_ENDPOINT,
      {
        method: "POST",
        auth: "api-key",
        bodyJson: { specification },
      }
    );

    if (!response.coupon?.id) {
      throw new AppError(
        "Wix coupon API returned success but no coupon id. " +
          "Verify the API key has 'Manage Coupons' permission and the Wix Store is installed.",
        500,
        response
      );
    }

    return response;
  } catch (error) {
    // Re-throw with richer context so the caller can decide on fallback.
    console.error("[THE_GRID_COUPON_CREATE_FAILED]", {
      code: input.code,
      amount: input.amount,
      error,
    });
    throw error;
  }
}
