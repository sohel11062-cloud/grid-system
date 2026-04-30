import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { refreshSessionIfNeeded } from "@/server/auth-service";
import { AppError } from "@/server/errors";
import { readSessionCookie, setSessionCookie } from "@/server/session";

export async function requireSession(request: NextRequest) {
  const session = await readSessionCookie(request);

  if (!session) {
    throw new AppError("Authentication required.", 401);
  }

  return refreshSessionIfNeeded(session);
}

export async function persistSessionIfRefreshed(
  response: NextResponse,
  authState: Awaited<ReturnType<typeof requireSession>>
) {
  if (authState.refreshed) {
    await setSessionCookie(response, authState.session);
  }
}
