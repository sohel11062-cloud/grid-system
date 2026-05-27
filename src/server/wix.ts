import "server-only";

import { AppError, ErrorCode } from "@/server/errors";
import { MSG } from "@/server/brand";
import { getEnv } from "@/server/env";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface WixMember {
  _id: string;
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
    } | string | number;

    totalPrice?: {
      amount?: string | number;
      currency?: string;
    };

    subtotal?: {
      amount?: string | number;
      currency?: string;
    };
  };

  totals?: {
    total?: string | number;
  };

  lineItems?: Array<{
    productName?: {
      original?: string;
    };
  }>;

  appliedCoupon?: {
    couponId?: string;
    name?: string;
    code?: string;

    discount?: {
      amount?: string | number;
      currency?: string;
    };
  };
}

export interface WixCouponCreateResponse {
  id: string;
}

export interface WixCoupon {
  id: string;

  expired?: boolean;

  numberOfUsages?: number;

  specification?: {
    name?: string;
    code?: string;

    active?: boolean;

    type?: string;

    usageLimit?: number;

    limitedToOneItem?: boolean;

    startTime?: string;

    expirationTime?: string;

    moneyOffAmount?: number;

    percentOffRate?: number;

    scope?: {
      namespace?: string;

      group?: {
        name?: string;
        entityId?: string;
      };
    };
  };
}

type JsonBody = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const WIX_TIMEOUT_MS = 20_000;

const RETRYABLE_STATUSES = new Set([
  429,
  503,
  504,
]);

// ─────────────────────────────────────────────────────────────────────────────
// CORE REQUEST HELPER
// ─────────────────────────────────────────────────────────────────────────────

async function wixRequest<T>(
  url: string,
  options: RequestInit & {
    bodyJson?: JsonBody;
  },
): Promise<T> {

  const env = getEnv();

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => controller.abort(),
      WIX_TIMEOUT_MS,
    );

  const headers =
    new Headers(options.headers);

  headers.set(
    "Accept",
    "application/json",
  );

  headers.set(
    "Content-Type",
    "application/json",
  );

  headers.set(
    "Authorization",
    `Bearer ${env.WIX_API_KEY}`,
  );


  let response: Response;

  try {

    response =
      await fetch(url, {
        ...options,

        headers,

        cache: "no-store",

        body:
          options.bodyJson
            ? JSON.stringify(options.bodyJson)
            : options.body,

        signal:
          controller.signal,
      });

  } catch (error) {

    clearTimeout(timeoutId);

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {

      console.error(
        "[GRID_WIX_TIMEOUT]",
        { url },
      );

      throw new AppError(
        MSG.INTERNAL_ERROR,
        504,
        ErrorCode.WIX_API_TIMEOUT,
      );
    }

    console.error(
      "[GRID_WIX_NETWORK_ERROR]",
      {
        url,
        error,
      },
    );

    throw new AppError(
      MSG.INTERNAL_ERROR,
      503,
      ErrorCode.WIX_API_ERROR,
    );

  } finally {

    clearTimeout(timeoutId);
  }

  const text =
    await response.text().catch(() => "");

  let data: unknown = {};

  try {

    data =
      text
        ? JSON.parse(text)
        : {};

  } catch {

    console.error(
      "[GRID_WIX_INVALID_JSON]",
      text,
    );
  }

  if (!response.ok) {

  console.error(
    "[GRID_WIX_API_ERROR]",
    {
      url,
      status: response.status,
      response: data,
    },
  );

  console.error(
    "[GRID_WIX_FULL_RESPONSE]",
    JSON.stringify(data, null, 2),
  );

    throw new AppError(
      MSG.INTERNAL_ERROR,
      response.status,
      ErrorCode.WIX_API_ERROR,
      {
        status: response.status,
        response: data,
      },
    );
  }

  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetry = 1,
): Promise<T> {

  let lastError: unknown;

  for (
    let attempt = 0;
    attempt <= maxRetry;
    attempt++
  ) {

    try {

      return await fn();

    } catch (error) {

      lastError = error;

      if (attempt >= maxRetry) {
        break;
      }

      const retryable =
        error instanceof AppError &&
        RETRYABLE_STATUSES.has(error.status);

      if (!retryable) {
        break;
      }

      const delay =
        600 * (attempt + 1);

      console.warn(
        `[GRID_WIX] ${label} retry ${attempt + 1} in ${delay}ms`,
      );

      await new Promise<void>((resolve) =>
        setTimeout(resolve, delay),
      );
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// DUPLICATE CODE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function isDuplicateCodeError(
  error: unknown,
): boolean {

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return (
    message.includes("already exists") ||
    message.includes("duplicate") ||
    message.includes("409")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

export async function getMemberById(
  memberId: string,
): Promise<WixMember> {

  return withRetry(
    "getMemberById",
    async () => {

      const { WIX_MEMBERS_ENDPOINT } =
        getEnv();

      const response =
        await wixRequest<{
          member?: WixMember;
        }>(
          `${WIX_MEMBERS_ENDPOINT}/${memberId}`,
          {
            method: "GET",
          },
        );

      if (!response.member) {

        throw new AppError(
          MSG.INTERNAL_ERROR,
          404,
          ErrorCode.WIX_API_ERROR,
        );
      }

      return response.member;
    },
  );
}

export async function queryAllMembers(): Promise<WixMember[]> {

  const {
    WIX_MEMBERS_QUERY_ENDPOINT,
  } = getEnv();

  const all: WixMember[] = [];

  let offset = 0;

  const LIMIT = 100;

  for (;;) {

    const response =
      await withRetry(
        "queryAllMembers",
        () =>
          wixRequest<{
            members?: WixMember[];
          }>(
            WIX_MEMBERS_QUERY_ENDPOINT,
            {
              method: "POST",

              bodyJson: {
                paging: {
                  limit: LIMIT,
                  offset,
                },
              },
            },
          ),
      );

    const batch =
      response.members ?? [];

    all.push(...batch);

    if (batch.length < LIMIT) {
      break;
    }

    offset += LIMIT;
  }

  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────────────────────────

export async function getContactById(
  contactId: string,
): Promise<WixContact> {

  return withRetry(
    "getContactById",
    async () => {

      const {
        WIX_CONTACTS_ENDPOINT,
      } = getEnv();

      const response =
        await wixRequest<{
          contact?: WixContact;
        }>(
          `${WIX_CONTACTS_ENDPOINT}/${contactId}`,
          {
            method: "GET",
          },
        );

      if (!response.contact) {

        throw new AppError(
          MSG.INTERNAL_ERROR,
          404,
          ErrorCode.WIX_API_ERROR,
        );
      }

      return response.contact;
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────

export async function searchOrdersByIdentity(
  identity: {
    memberId?: string | null;
    contactId?: string | null;
    email?: string | null;
  },
): Promise<WixOrder[]> {

  const {
    WIX_ORDERS_SEARCH_ENDPOINT,
  } = getEnv();

  const conditions: JsonBody[] = [];

  if (identity.memberId) {
    conditions.push({
      "buyerInfo.memberId": {
        $eq: identity.memberId,
      },
    });
  }

  if (identity.contactId) {
    conditions.push({
      "buyerInfo.contactId": {
        $eq: identity.contactId,
      },
    });
  }

  if (identity.email) {
    conditions.push({
      "buyerInfo.email": {
        $eq: identity.email,
      },
    });
  }

  if (conditions.length === 0) {
    return [];
  }

  const filter: JsonBody =
    conditions.length === 1
      ? conditions[0]
      : { $or: conditions };

  return withRetry(
    "searchOrdersByIdentity",
    async () => {

      const response =
        await wixRequest<{
          orders?: WixOrder[];
        }>(
          WIX_ORDERS_SEARCH_ENDPOINT,
          {
            method: "POST",

            bodyJson: {
              filter,

              sort: [
                {
                  fieldName: "purchasedDate",
                  order: "DESC",
                },
              ],

              cursorPaging: {
                limit: 100,
              },
            },
          },
        );

      return response.orders ?? [];
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE COUPON
// ─────────────────────────────────────────────────────────────────────────────

export async function createMoneyOffCoupon({
  code,
  amount,
}: {
  code: string;
  amount: number;
}): Promise<WixCouponCreateResponse> {

  if (!Number.isFinite(amount) || amount <= 0) {

    throw new AppError(
      "Invalid coupon amount.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const expirationTime =
    Date.now() +
    365 * 24 * 60 * 60 * 1000;

  const payload = {
    specification: {

      name: `GRID-${code}`,

      code,

      active: true,

      usageLimit: 1,

      limitedToOneItem: false,

      startTime:
        Date.now().toString(),

      expirationTime:
        expirationTime.toString(),

      scope: {
  namespace: "wix-stores",
},

      // IMPORTANT:
      // MUST BE NUMBER
      moneyOffAmount: amount,
    },
  };

  console.log(
    "[GRID_WIX_COUPON_PAYLOAD]",
    JSON.stringify(payload, null, 2),
  );

  const response =
    await wixRequest<WixCouponCreateResponse>(
      "https://www.wixapis.com/stores/v2/coupons",
      {
        method: "POST",

        bodyJson:
          payload,
      },
    );

  console.log(
    "[GRID_WIX_COUPON_SUCCESS]",
    response,
  );

  if (!response?.id) {

    console.error(
      "[GRID_WIX_INVALID_COUPON_RESPONSE]",
      response,
    );

    throw new AppError(
      "Coupon created but Wix returned no coupon ID.",
      502,
      ErrorCode.COUPON_CREATE_FAILED,
    );
  }

  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET COUPON
// ─────────────────────────────────────────────────────────────────────────────

export async function getCoupon(
  couponId: string,
): Promise<WixCoupon> {

  return withRetry(
    "getCoupon",
    async () => {

      const response =
        await wixRequest<{
          coupon?: WixCoupon;
        }>(
          `https://www.wixapis.com/stores/v2/coupons/${couponId}`,
          {
            method: "GET",
          },
        );

      if (!response.coupon) {

        throw new AppError(
          "Coupon not found.",
          404,
          ErrorCode.WIX_API_ERROR,
        );
      }

      return response.coupon;
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY COUPONS
// ─────────────────────────────────────────────────────────────────────────────

export async function queryCouponsByCode(
  code: string,
): Promise<WixCoupon[]> {

  return withRetry(
    "queryCouponsByCode",
    async () => {

      const response =
        await wixRequest<{
          coupons?: WixCoupon[];
        }>(
          "https://www.wixapis.com/stores/v2/coupons/query",
          {
            method: "POST",

            bodyJson: {
              query: {
                filter: {
  "specification.code": {
    $eq: code,
  },
},
              },
            },
          },
        );

      return response.coupons ?? [];
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE COUPON
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteCoupon(
  couponId: string,
): Promise<void> {

  await withRetry(
    "deleteCoupon",
    async () => {

      await wixRequest(
        `https://www.wixapis.com/stores/v2/coupons/${couponId}`,
        {
          method: "DELETE",
        },
      );

      return true;
    },
  );
}