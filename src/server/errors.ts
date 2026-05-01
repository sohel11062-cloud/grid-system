// Error codes for structured client-side handling
export const ErrorCode = {
  AUTH_REQUIRED:          "AUTH_REQUIRED",
  SESSION_EXPIRED:        "SESSION_EXPIRED",
  VALIDATION_ERROR:       "VALIDATION_ERROR",
  INSUFFICIENT_BALANCE:   "INSUFFICIENT_BALANCE",
  COUPON_CREATE_FAILED:   "COUPON_CREATE_FAILED",
  CONCURRENT_REDEMPTION:  "CONCURRENT_REDEMPTION",
  RATE_LIMITED:           "RATE_LIMITED",
  LEDGER_NOT_FOUND:       "LEDGER_NOT_FOUND",
  WIX_API_ERROR:          "WIX_API_ERROR",
  WIX_API_TIMEOUT:        "WIX_API_TIMEOUT",
  DUPLICATE_COUPON_CODE:  "DUPLICATE_COUPON_CODE",
  INTERNAL_ERROR:         "INTERNAL_ERROR",
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly status:  number;
  readonly code:    ErrorCode;
  readonly details: unknown;

  constructor(
    message:  string,
    status:   number = 500,
    code:     ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: unknown
  ) {
    super(message);
    this.name    = "AppError";
    this.status  = status;
    this.code    = code;
    this.details = details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, AppError);
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError(error.message, 500, ErrorCode.INTERNAL_ERROR);
  }
  if (typeof error === "string") {
    return new AppError(error, 500, ErrorCode.INTERNAL_ERROR);
  }
  return new AppError("An unexpected error occurred.", 500, ErrorCode.INTERNAL_ERROR);
}