import "server-only";

import { AppError, ErrorCode } from "@/server/errors";
import { getEnv } from "@/server/env";

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface WixMember {
  id:          string;
  contactId?:  string;
  loginEmail?: string;
  profile?:    { nickname?: string };
  contact?:    { firstName?: string; lastName?: string };
}

export interface WixContact {
  id:           string;
  primaryInfo?: { email?: string };
  info?: {
    birthdate?: string;
    name?:      { first?: string; last?: string };
  };
}

export interface WixOrder {
  id:              string;
  number?:         string;
  status?:         string;
  paymentStatus?:  string;
  purchasedDate?:  string;
  priceSummary?: {
    total?:      { amount?: string | number; currency?: string };
    totalPrice?: { amount?: string | number; currency?: string };
    subtotal?:   { amount?: string | number; currency?: string };
  };
  totals?:       { total?: string | number };
  lineItems?:    Array<{ productName?: { original?: string } }>;
  /** NEW — Wix populates this when a coupon was applied to the order */
  appliedCoupon?: {
    couponId?: string;
    name?:     string;
    code?:     string;
    discount?: { amount?: string | number; currency?: string };
  };
}

export interface WixCouponCreateResponse {
  coupon?: { id?: string; code?: string };
}

type JsonBody = Record<string, unknown>;

// ─── Constants ────────────────────────────────────────────────────────────────

const WIX_TIMEOUT_MS      = 20_000;
const RETRYABLE_STATUSES  = new Set([429, 503, 504]);

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function wixRequest<T>(
  url:     string,
  options: RequestInit & { bodyJson?: JsonBody }
): Promise<T> {
  const env        = getEnv();
  const controller = new AbortController();
  const tid        = setTimeout(() => controller.abort(), WIX_TIMEOUT_MS);

  const headers = new Headers(options.headers);
  headers.set("Accept",       "application/json");
  headers.set("Authorization", env.WIX_API_KEY);
  headers.set("wix-site-id",  env.WIX_SITE_ID);
  if (options.bodyJson) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      cache:  "no-store",
      body:   options.bodyJson ? JSON.stringify(options.bodyJson) : options.body,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new AppError(
        `Wix API timed out after ${WIX_TIMEOUT_MS}ms`,
        504,
        ErrorCode.WIX_API_TIMEOUT,
        { url }
      );
    }
    throw new AppError(
      `Wix API network failure: ${e instanceof Error ? e.message : String(e)}`,
      503,
      ErrorCode.WIX_API_ERROR,
      { url }
    );
  } finally {
    clearTimeout(tid);
  }

  const text = await response.text().catch(() => "");
  let json: unknown;
  try { json = text ? JSON.parse(text) : {}; }
  catch { json = { rawText: text }; }

  if (!response.ok) {
    const b = typeof json === "object" && json !== null
      ? (json as Record<string, unknown>) : {};
    const message =
      typeof b.message === "string" ? b.message :
      typeof b.error   === "string" ? b.error   :
      `Wix API error — HTTP ${response.status}`;

    console.error("[THE_GRID_WIX_ERROR]", { url, status: response.status, message });
    throw new AppError(message, response.status, ErrorCode.WIX_API_ERROR, {
      status: response.status, errorCode: b.errorCode ?? b.code,
    });
  }

  return json as T;
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function withRetry<T>(
  label:    string,
  fn:       () => Promise<T>,
  maxRetry  = 1
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetry) break;
      const retryable = err instanceof AppError && RETRYABLE_STATUSES.has(err.status);
      if (!retryable) break;
      const delay = 600 * (attempt + 1);
      console.warn(`[THE_GRID_RETRY] ${label} attempt ${attempt + 1}, retrying in ${delay}ms`);
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ─── Duplicate coupon detection ───────────────────────────────────────────────

export function isDuplicateCodeError(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;
  if (error.status !== 400 && error.status !== 409) return false;
  const details = JSON.stringify(error.details ?? "").toLowerCase();
  return (
    details.includes("duplicate")    ||
    details.includes("already exist")||
    details.includes("unique")
  );
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getMemberById(memberId: string): Promise<WixMember> {
  return withRetry("getMemberById", async () => {
    const env = getEnv();
    const res = await wixRequest<{ member?: WixMember }>(
      `${env.WIX_MEMBERS_ENDPOINT}/${memberId}`,
      { method: "GET" }
    );
    if (!res.member) throw new AppError(`No member for id ${memberId}`, 404, ErrorCode.WIX_API_ERROR);
    return res.member;
  });
}

export async function queryAllMembers(): Promise<WixMember[]> {
  const env = getEnv();
  const all: WixMember[] = [];
  const LIMIT = 100;
  let offset  = 0;

  for (;;) {
    const res = await withRetry("queryAllMembers", () =>
      wixRequest<{ members?: WixMember[] }>(
        env.WIX_MEMBERS_QUERY_ENDPOINT,
        { method: "POST", bodyJson: { paging: { limit: LIMIT, offset } } }
      )
    );
    const batch = res.members ?? [];
    all.push(...batch);
    if (batch.length < LIMIT) break;
    offset += LIMIT;
  }

  return all;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function getContactById(contactId: string): Promise<WixContact> {
  return withRetry("getContactById", async () => {
    const env = getEnv();
    const res = await wixRequest<{ contact?: WixContact }>(
      `${env.WIX_CONTACTS_ENDPOINT}/${contactId}`,
      { method: "GET" }
    );
    if (!res.contact) throw new AppError(`No contact for id ${contactId}`, 404, ErrorCode.WIX_API_ERROR);
    return res.contact;
  });
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function searchOrdersByIdentity(identity: {
  memberId?:  string | null;
  contactId?: string | null;
  email?:     string | null;
}): Promise<WixOrder[]> {
  const env        = getEnv();
  const conditions: JsonBody[] = [];

  if (identity.memberId)  conditions.push({ "buyerInfo.memberId":  { $eq: identity.memberId } });
  if (identity.contactId) conditions.push({ "buyerInfo.contactId": { $eq: identity.contactId } });
  if (identity.email)     conditions.push({ "buyerInfo.email":     { $eq: identity.email } });

  if (conditions.length === 0) return [];

  const filter: JsonBody = conditions.length === 1 ? conditions[0] : { $or: conditions };

  return withRetry("searchOrdersByIdentity", async () => {
    const res = await wixRequest<{ orders?: WixOrder[] }>(
      env.WIX_ORDERS_SEARCH_ENDPOINT,
      {
        method:   "POST",
        bodyJson: {
          filter,
          sort:         [{ fieldName: "purchasedDate", order: "DESC" }],
          cursorPaging: { limit: 100 },
        },
      }
    );
    return res.orders ?? [];
  });
}

// ─── Coupons ──────────────────────────────────────────────────────────────────

/**
 * POST https://www.wixapis.com/stores/v2/coupons
 *
 * Non-negotiable rules per Wix Stores v2:
 *  - specification.type           = "MoneyOff"    (literal)
 *  - specification.moneyOffAmount = number        (NOT string)
 *  - specification.usageLimit     = 1
 *  - specification.startTime      = string ms epoch
 *  - specification.expirationTime = string ms epoch
 *  - specification.active         = true
 */
export async function createMoneyOffCoupon(input: {
  code:   string;
  amount: number; // integer rupees, validated before calling
}): Promise<WixCouponCreateResponse> {
  const env          = getEnv();
  const numericAmount = Number(input.amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isInteger(numericAmount)) {
    throw new AppError(
      `Invalid coupon amount: ${input.amount} — must be a positive integer`,
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const code = input.code.trim();
  if (!code || code.length < 4) {
    throw new AppError("Invalid coupon code", 400, ErrorCode.VALIDATION_ERROR);
  }

  const nowMs    = Date.now();
  const expiryMs = nowMs + 365 * 24 * 60 * 60 * 1000; // 1 year

  const payload: JsonBody = {
    specification: {
      name:           `THE GRID — ₹${numericAmount} REWARD`,
      code,
      startTime:      String(nowMs),
      expirationTime: String(expiryMs),
      active:         true,
      usageLimit:     1,
      scope:          { namespace: env.GRID_COUPON_SCOPE_NAMESPACE || "stores" },
      type:           "MoneyOff",
      moneyOffAmount: numericAmount,
    },
  };

  console.info("[THE_GRID_COUPON_REQUEST]", {
    endpoint: env.WIX_COUPONS_ENDPOINT,
    code,
    amount:   numericAmount,
  });

  const res = await wixRequest<WixCouponCreateResponse>(
    env.WIX_COUPONS_ENDPOINT,
    { method: "POST", bodyJson: payload }
  );

  console.info(

  "🔥 FULL WIX RESPONSE >>>",

  JSON.stringify(res, null, 2)

);

  if (!res.coupon?.id) {
    throw new AppError(
      "Wix coupon API returned 200 but no coupon.id. " +
      "Verify: API key has Manage Coupons permission, Wix Store is installed.",
      500,
      ErrorCode.COUPON_CREATE_FAILED
    );
  }

  return res;
}