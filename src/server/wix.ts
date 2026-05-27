import "server-only";

import { AppError, ErrorCode } from "@/server/errors";
import { MSG } from "@/server/brand";
import { getEnv } from "@/server/env";

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN TYPES
// ─────────────────────────────────────────────────────────────────────────────

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
    };
  };
}

export interface WixCouponCreateResponse {
  id?: string;

  coupon?: {
    id?: string;
    code?: string;
  };

  data?: {
    id?: string;

    coupon?: {
      id?: string;
      code?: string;
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

  // IMPORTANT:
  // DO NOT FORCE "Bearer "
  // Your older Wix setup worked without it.
  headers.set(
    "Authorization",
    env.WIX_API_KEY,
  );

  headers.set(
    "wix-site-id",
    env.WIX_SITE_ID,
  );

  if (options.bodyJson) {

    headers.set(
      "Content-Type",
      "application/json",
    );
  }

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

      throw new AppError(
        `Wix API timed out after ${WIX_TIMEOUT_MS}ms`,
        504,
        ErrorCode.WIX_API_TIMEOUT,
        { url },
      );
    }

    throw new AppError(
      `Wix API network failure: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
      503,
      ErrorCode.WIX_API_ERROR,
      { url },
    );

  } finally {

    clearTimeout(timeoutId);
  }

  const text =
    await response.text().catch(() => "");

  let json: unknown = {};

  try {

    json =
      text
        ? JSON.parse(text)
        : {};

  } catch {

    json = {
      rawText: text,
    };
  }

  if (!response.ok) {

    const bodyObj =
      typeof json === "object" &&
      json !== null
        ? json as Record<string, unknown>
        : {};

    const message =
      typeof bodyObj.message === "string"
        ? bodyObj.message
        : typeof bodyObj.error === "string"
          ? bodyObj.error
          : `Wix API error — HTTP ${response.status}`;

    console.error(
      "[GRID_WIX_API_ERROR]",
      {
        url,
        status: response.status,
        errorCode:
          bodyObj.errorCode ??
          bodyObj.code ??
          null,
        message,
      },
    );

    throw new AppError(
      message,
      response.status,
      ErrorCode.WIX_API_ERROR,
      {
        status: response.status,
        errorCode:
          bodyObj.errorCode ??
          bodyObj.code,
      },
    );
  }

  return json as T;
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
        `[GRID_WIX_RETRY] ${label} retry ${attempt + 1} in ${delay}ms`,
      );

      await new Promise<void>((resolve) =>
        setTimeout(resolve, delay),
      );
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// DUPLICATE COUPON DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function isDuplicateCodeError(
  error: unknown,
): boolean {

  if (!(error instanceof AppError)) {
    return false;
  }

  if (
    error.status !== 400 &&
    error.status !== 409
  ) {
    return false;
  }

  const details =
    JSON.stringify(
      error.details ?? "",
    ).toLowerCase();

  return (
    details.includes("duplicate") ||
    details.includes("already exist") ||
    details.includes("unique") ||
    details.includes("code")
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

      const {
        WIX_MEMBERS_ENDPOINT,
      } = getEnv();

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

  const LIMIT = 100;

  let offset = 0;

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

export async function createMoneyOffCoupon(input: {
  code: string;
  amount: number;
}): Promise<{ id: string }> {

  const env = getEnv();

  const numericAmount =
    Number(input.amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    !Number.isInteger(numericAmount)
  ) {

    throw new AppError(
      `Invalid coupon amount: ${input.amount}`,
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const code =
    input.code.trim();

  if (!code || code.length < 4) {

    throw new AppError(
      "Invalid coupon code.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const nowMs =
    Date.now();

  const expiryMs =
    nowMs +
    365 * 24 * 60 * 60 * 1000;

  // IMPORTANT:
  // This exact structure worked before.
  const payload: JsonBody = {
    specification: {

      name:
        `THE GRID — ₹${numericAmount} REWARD`,

      code,

      active: true,

      usageLimit: 1,

      type: "MoneyOff",

      startTime:
        String(nowMs),

      expirationTime:
        String(expiryMs),

      scope: {
        namespace:
          env.GRID_COUPON_SCOPE_NAMESPACE ||
          "stores",
      },

      moneyOffAmount:
        numericAmount,
    },
  };

  console.info(
    "[GRID_COUPON_REQUEST]",
    {
      endpoint:
        env.WIX_COUPONS_ENDPOINT,

      code,

      amount:
        numericAmount,
    },
  );

  const response =
    await wixRequest<WixCouponCreateResponse>(
      env.WIX_COUPONS_ENDPOINT,
      {
        method: "POST",

        bodyJson:
          payload,
      },
    );

  console.info(
    "[GRID_COUPON_RESPONSE]",
    response,
  );

  // IMPORTANT:
  // Flexible response parsing
  const couponId =
    response?.id ||
    response?.coupon?.id ||
    response?.data?.id ||
    response?.data?.coupon?.id;

  if (!couponId) {

    throw new AppError(
      "Wix coupon API returned success but no coupon ID.",
      500,
      ErrorCode.COUPON_CREATE_FAILED,
    );
  }

  return {
    id: couponId,
  };
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