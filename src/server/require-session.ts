import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { refreshSessionIfNeeded } from "@/server/auth-service";
import { AppError, ErrorCode } from "@/server/errors";
import { readSessionCookie, setSessionCookie } from "@/server/session";

export async function requireSession(request: NextRequest) {
  const session = await readSessionCookie(request);

  if (!session) {
    throw new AppError(
      "Authentication required. Please sign in.",
      401,
      ErrorCode.AUTH_REQUIRED
    );
  }

  // Check for obviously corrupt session fields
  if (!session.memberId || typeof session.memberId !== "string") {
    throw new AppError(
      "Session is invalid or corrupt. Please sign in again.",
      401,
      ErrorCode.SESSION_EXPIRED
    );
  }

  return refreshSessionIfNeeded(session);
}

export async function persistSessionIfRefreshed(
  response:  NextResponse,
  authState: Awaited<ReturnType<typeof requireSession>>
): Promise<void> {
  if (authState.refreshed) {
    await setSessionCookie(response, authState.session);
  }
}