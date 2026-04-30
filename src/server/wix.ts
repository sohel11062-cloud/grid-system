import "server-only";

import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";

// ─── Domain types ─────────────────────────────────────────────────────────────

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
    // Wix returns amount as string e.g. "1500.00"
    subtotal?: { amount?: string | number; currency?: string };
    total?: { amount?: string | number; currency?: string };
    totalPrice?: { amount?: string | number; currency?: string };
  };
  // Fallback field name in some API versions
  totals?: { total?: string | number };
  lineItems?: Array<{
    productName?: { original?: string };
    price?: string | number;
    quantity?: number;
  }>;
}

export interface WixCouponResponse {
  coupon?: { id?: string; code?: string };
  id?: string; // top-level id in some response shapes
}

type JsonObject = Record<string, unknown>;

// ─── Core request helper ───────────────────────────────────────────────────────

async function parseJsonResponse<T>(response: Response, url: string): Promise<T> {
  const text = await response.text();
  let json: unknown = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { rawText: text };
  }

  if (!response.ok) {
    const message =
      json &&
      typeof json === "object" &&
      "message" in (json as Record<string, unknown>) &&
      typeof (json as Record<string, unknown>).message === "string"
        ? (json as Record<string, unknown>).message as string
        : `Wix API ${response.status} — ${url}`;

    console.error("[THE_GRID_WIX_API_ERROR]", {
      url,
      status: response.status,
      statusText: response.statusText,
      responseBody: json,
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

  const body = options.bodyJson ? JSON.stringify(options.bodyJson) : options.body;

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
    body,
  });

  return parseJsonResponse<T>(response, url);
}

// ─── Members ──────────────────────────────────────────────────────────────────

/**
 * GET /members/v1/members/{id}
 * Response: { member: { id, loginEmail, contactId, profile, contact } }
 */
export async function getMemberById(memberId: string): Promise<WixMember> {
  const env = getEnv();
  const response = await wixRequest<{ member?: WixMember }>(
    `${env.WIX_MEMBERS_ENDPOINT}/${memberId}`,
    { method: "GET", auth: "api-key" }
  );

  if (!response.member) {
    throw new AppError(`Wix returned no member object for id ${memberId}`, 404);
  }
  return response.member;
}

/**
 * POST /members/v1/members/query
 * Response: { members: [...], pagingMetadata }
 */
export async function queryAllMembers(): Promise<WixMember[]> {
  const env = getEnv();
  const all: WixMember[] = [];
  const LIMIT = 100;
  let offset = 0;

  for (;;) {
    const response = await wixRequest<{ members?: WixMember[] }>(
      env.WIX_MEMBERS_QUERY_ENDPOINT,
      { method: "POST", auth: "api-key", bodyJson: { paging: { limit: LIMIT, offset } } }
    );
    const batch = response.members ?? [];
    all.push(...batch);
    if (batch.length < LIMIT) break;
    offset += LIMIT;
  }

  return all;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

/**
 * GET /contacts/v4/contacts/{id}
 * Response: { contact: { id, primaryInfo, info } }
 */
export async function getContactById(contactId: string): Promise<WixContact> {
  const env = getEnv();
  const response = await wixRequest<{ contact?: WixContact }>(
    `${env.WIX_CONTACTS_ENDPOINT}/${contactId}`,
    { method: "GET", auth: "api-key" }
  );

  if (!response.contact) {
    throw new AppError(`Wix returned no contact for id ${contactId}`, 404);
  }
  return response.contact;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * POST /ecom/v1/orders/search
 * Uses $or across memberId, contactId, email to maximise order match rate.
 * Response: { orders: [...] }
 */
export async function searchOrdersByIdentity(identity: {
  memberId?: string | null;
  contactId?: string | null;
  email?: string | null;
}): Promise<WixOrder[]> {
  const env = getEnv();

  const conditions: JsonObject[] = [];
  if (identity.memberId)  conditions.push({ "buyerInfo.memberId":  { $eq: identity.memberId } });
  if (identity.contactId) conditions.push({ "buyerInfo.contactId": { $eq: identity.contactId } });
  if (identity.email)     conditions.push({ "buyerInfo.email":     { $eq: identity.email } });

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

// ─── Coupons ──────────────────────────────────────────────────────────────────

/**
 * POST https://www.wixapis.com/ecom/v1/coupons
 *
 * ecom v1 payload format (Money type for amount):
 * {
 *   name, code,
 *   moneyOffAmount: { amount: Number, currency: "INR" },
 *   usageLimit: 1, active: true,
 *   scope: { namespace: "stores" }
 * }
 *
 * If this endpoint doesn't exist in your Wix app setup, set
 * WIX_COUPONS_ENDPOINT=https://www.wixapis.com/stores/v2/coupons
 * and adjust payload to use specification wrapper with numeric moneyOffAmount.
 */
export async function createMoneyOffCoupon(input: {
  code: string;
  amount: number; // rupees, already validated as multiple of 100
}): Promise<WixCouponResponse> {
  const env = getEnv();

  // amount MUST be a number — Wix rejects strings
  const numericAmount = Number(input.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new AppError(`Invalid coupon amount: ${input.amount}`, 400);
  }

  const requestBody: JsonObject = {
    name: `THE GRID — ₹${numericAmount} REWARD`,
    code: input.code,
    moneyOffAmount: {
      amount: numericAmount,
      currency: env.GRID_CURRENCY || "INR",
    },
    usageLimit: 1,
    active: true,
    scope: { namespace: env.GRID_COUPON_SCOPE_NAMESPACE || "stores" },
    startTime: new Date().toISOString(),
  };

  console.info("[THE_GRID_COUPON_REQUEST]", {
    endpoint: env.WIX_COUPONS_ENDPOINT,
    body: requestBody,
  });

  let response: WixCouponResponse;
  try {
    response = await wixRequest<WixCouponResponse>(env.WIX_COUPONS_ENDPOINT, {
      method: "POST",
      auth: "api-key",
      bodyJson: requestBody,
    });
  } catch (error) {
    console.error("[THE_GRID_COUPON_API_FAILED]", { code: input.code, amount: numericAmount, error });
    throw error; // Propagate — coupon-service handles the error boundary
  }

  console.info("[THE_GRID_COUPON_RESPONSE]", response);

  const couponId = response.coupon?.id ?? response.id;
  if (!couponId) {
    throw new AppError(
      "Wix coupon API returned HTTP 200 but no coupon.id. " +
        "Verify: (1) API key has 'Manage Coupons' permission, " +
        "(2) Wix Store is installed and published, " +
        "(3) WIX_COUPONS_ENDPOINT is correct.",
      500,
      response
    );
  }

  return response;
}
