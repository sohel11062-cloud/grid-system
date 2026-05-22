import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { refreshSessionIfNeeded } from "@/server/auth-service";
import { AppError, ErrorCode } from "@/server/errors";
import { MSG } from "@/server/brand";
import { readSessionCookie, setSessionCookie } from "@/server/session";
import { ensureUserFromSession } from "@/server/user-service";

/**
 * Reads and validates the session cookie, then proactively refreshes the
 * access token if it is within 5 minutes of expiry.
 *
 * Throws `AppError(401)` when the cookie is absent or malformed.
 * Returns an `AuthState` object containing the (possibly refreshed) session
 * and a `refreshed` flag so the caller can rewrite the cookie if needed.
 */
export async function requireSession(request: NextRequest) {
  const session = await readSessionCookie(request);

  if (!session) {
    throw new AppError(MSG.AUTH_REQUIRED, 401, ErrorCode.AUTH_REQUIRED);
  }

  if (!session.memberId || typeof session.memberId !== "string") {
    throw new AppError(MSG.SESSION_EXPIRED, 401, ErrorCode.SESSION_EXPIRED);
  }

  const authState = await refreshSessionIfNeeded(session);
  const user = await ensureUserFromSession(authState.session);

  return { ...authState, user };
}

/**
 * Rewrites the session cookie only when the access token was refreshed.
 * Call this at the end of every protected route handler to keep the cookie fresh.
 */
export async function persistSessionIfRefreshed(
  response:  NextResponse,
  authState: Awaited<ReturnType<typeof requireSession>>,
): Promise<void> {
  if (authState.refreshed) {
    await setSessionCookie(response, authState.session);
  }
}
