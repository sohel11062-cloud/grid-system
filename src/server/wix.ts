import "server-only";

import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";

export interface WixMember {
  id: string;
  contactId?: string;
  loginEmail?: string;
  profile?: {
    nickname?: string;
  };
  contact?: {
    firstName?: string;
    lastName?: string;
  };
}

export interface WixContact {
  id: string;
  primaryInfo?: {
    email?: string;
  };
  info?: {
    birthdate?: string;
    name?: {
      first?: string;
      last?: string;
    };
  };
}

export interface WixOrder {
  id: string;
  number?: string;
  status?: string;
  paymentStatus?: string;
  purchasedDate?: string;
  priceSummary?: {
    total?: {
      amount?: string | number;
      currency?: string;
    };
  };
  lineItems?: Array<{
    productName?: {
      original?: string;
    };
  }>;
}

interface WixCouponResponse {
  id?: string;
  coupon?: {
    id?: string;
  };
}

type JsonObject = Record<string, unknown>;

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const json = text ? (JSON.parse(text) as T | { message?: string; details?: unknown }) : null;

  if (!response.ok) {
    const message =
      (json && typeof json === "object" && "message" in json && typeof json.message === "string"
        ? json.message
        : null) ?? `Wix request failed with ${response.status}`;

    throw new AppError(message, response.status, json);
  }

  return (json ?? {}) as T;
}

async function wixRequest<T>(
  url: string,
  options: RequestInit & {
    auth?: "api-key";
    bodyJson?: JsonObject;
  }
) {
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
    body: options.bodyJson ? JSON.stringify(options.bodyJson) : options.body
  });

  return parseJsonResponse<T>(response);
}

function extractArray<T>(payload: Record<string, unknown>, keys: string[]): T[] {
  for (const key of keys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

export async function getMemberById(memberId: string) {
  const env = getEnv();
  return wixRequest<WixMember>(`${env.WIX_MEMBERS_ENDPOINT}/${memberId}`, {
    method: "GET",
    auth: "api-key"
  });
}

export async function queryAllMembers() {
  const env = getEnv();
  const members: WixMember[] = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const payload = await wixRequest<Record<string, unknown>>(env.WIX_MEMBERS_QUERY_ENDPOINT, {
      method: "POST",
      auth: "api-key",
      bodyJson: {
        paging: {
          limit,
          offset
        }
      }
    });

    const batch = extractArray<WixMember>(payload, ["members", "results", "items"]);
    members.push(...batch);

    if (batch.length < limit) {
      break;
    }

    offset += limit;
  }

  return members;
}

export async function getContactById(contactId: string) {
  const env = getEnv();
  return wixRequest<WixContact>(`${env.WIX_CONTACTS_ENDPOINT}/${contactId}`, {
    method: "GET",
    auth: "api-key"
  });
}

export async function searchOrdersByIdentity(identity: {
  memberId?: string;
  contactId?: string;
  email?: string;
}) {
  const env = getEnv();
  const filter =
    (identity.memberId && { "buyerInfo.memberId": { $eq: identity.memberId } }) ||
    (identity.contactId && { "buyerInfo.contactId": { $eq: identity.contactId } }) ||
    (identity.email && { "buyerInfo.email": { $eq: identity.email } });

  if (!filter) {
    return [] as WixOrder[];
  }

  const payload = await wixRequest<Record<string, unknown>>(env.WIX_ORDERS_SEARCH_ENDPOINT, {
    method: "POST",
    auth: "api-key",
    bodyJson: {
      filter,
      sort: [{ fieldName: "purchasedDate", order: "DESC" }],
      cursorPaging: {
        limit: 100
      }
    }
  });

  return extractArray<WixOrder>(payload, ["orders", "results", "items"]);
}

export async function createMoneyOffCoupon(input: { code: string; amount: number }) {
  const env = getEnv();

  return wixRequest<WixCouponResponse>(env.WIX_COUPONS_ENDPOINT, {
    method: "POST",
    auth: "api-key",
    bodyJson: {
      specification: {
        name: `THE GRID ${input.amount} CREDIT`,
        code: input.code,
        startTime: new Date().toISOString(),
        scope: {
          namespace: env.GRID_COUPON_SCOPE_NAMESPACE
        },
        moneyOffAmount: input.amount
      }
    }
  });
}
