import "server-only";

/**
 * Brand abstraction for THE GRID — The Vibe Canvas.
 *
 * All user-facing strings (UI, API responses, thrown errors) MUST use
 * constants from this file. Internal service files may reference the
 * underlying provider in console logs only — never in responses.
 */

export const BRAND_NAME   = "The Vibe Canvas";
export const PRODUCT_NAME = "THE GRID";

export const SYSTEM = {
  ENGINE:        "Reward Engine",
  SYNC:          "Grid Sync",
  STORE_ENGINE:  "Grid System",
  PROCESSING:    "Processing Engine",
  COUPON_NAME:   "Reward Coupon",
  CREDIT_NAME:   "Creds",
} as const;

export const MSG = {
  AUTH_REQUIRED:    "Authentication required. Please sign in.",
  SESSION_EXPIRED:  "Your session has expired. Please sign in again.",
  SYNC_SUCCESS:     "Grid ledger synchronized.",
  SYNC_FAILED:      "System sync failed. Please try again.",
  COUPON_CREATED:   "Reward coupon issued successfully.",
  COUPON_FAILED:    "Reward engine failed to generate coupon. No Creds were deducted.",
  COUPON_ALREADY_USED: "This reward coupon has already been used.",
  COUPON_EXPIRED:   "This reward coupon has expired.",
  COUPON_ID_MISSING:
    "Reward engine confirmed creation but returned no ID. " +
    "Verify engine permissions are enabled.",
  INSUFFICIENT_BALANCE: "Insufficient Cred balance for this redemption.",
  REDEMPTION_RACE:
    "A concurrent request was detected. Your Creds were NOT deducted. Please try again.",
  INTERNAL_ERROR:   "An internal error occurred. Please try again.",
  VALIDATION_ERROR: "Invalid request parameters.",
  RATE_LIMITED:     "Too many requests. Please slow down.",
  LEDGER_NOT_FOUND:
    "No loyalty ledger found for this account. Trigger a sync to initialise.",
} as const;

export const LOG_PREFIX = "[GRID_SYNC]";

export function logInfo(memberId: string, action: string, status: string, meta?: unknown): void {
  console.info(`${LOG_PREFIX} [${memberId}] [${action}] [${status}]`, meta ?? "");
}

export function logError(memberId: string, action: string, error: unknown, meta?: unknown): void {
  console.error(`${LOG_PREFIX} [${memberId}] [${action}] [FAILED]`, {
    error: error instanceof Error ? error.message : String(error),
    ...(meta ? { meta } : {}),
  });
}

export function logWarn(memberId: string, action: string, reason: string): void {
  console.warn(`${LOG_PREFIX} [${memberId}] [${action}] [WARN] ${reason}`);
}
