export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { exchangeCodeForSession } from "@/server/auth-service";
import { AppError, ErrorCode } from "@/server/errors";

import {
  handleRouteError,
  optionsResponse,
  successResponse,
} from "@/server/http";

import {
  clearOauthCookie,
  readOauthCookie,
  setSessionCookie,
} from "@/server/session";

import { getRepository } from "@/server/storage/repository";

export async function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

/**
 * POST /api/auth/exchange
 *
 * Flow:
 * 1. Validate OAuth state
 * 2. Exchange Wix auth code
 * 3. Bootstrap / hydrate member
 * 4. Auto assign admin roles
 * 5. Trigger initial sync
 * 6. Redirect admin → /admin
 * 7. Redirect users → /
 */

export async function POST(request: NextRequest) {
  try {
    // ─────────────────────────────────────────────────────────────
    // Parse request body
    // ─────────────────────────────────────────────────────────────

    let body: Record<string, unknown>;

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new AppError(
        "Invalid JSON body.",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const code =
      typeof body.code === "string"
        ? body.code.trim()
        : "";

    const state =
      typeof body.state === "string"
        ? body.state.trim()
        : "";

    if (!code || !state) {
      throw new AppError(
        "Missing required fields: code and state.",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Recover OAuth state cookie
    // ─────────────────────────────────────────────────────────────

    const oauthState = await readOauthCookie(request);

    // ─────────────────────────────────────────────────────────────
    // Exchange code → authenticated session
    // ─────────────────────────────────────────────────────────────

    const session = await exchangeCodeForSession({
      code,
      state,
      oauthState,
    });

    // ─────────────────────────────────────────────────────────────
    // Bootstrap / hydrate GRID member
    // ─────────────────────────────────────────────────────────────



    // ─────────────────────────────────────────────────────────────
    // Admin bootstrap
    // ─────────────────────────────────────────────────────────────

    try {
      const repo = getRepository();

      const adminEmails =
        process.env.ADMIN_EMAILS
          ?.split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean) ?? [];

      const isAdmin =
        !!session.email &&
        adminEmails.includes(
          session.email.toLowerCase(),
        );

      if (isAdmin) {
        await repo.grantUserRole(
          session.memberId,
          "owner",
          new Date().toISOString(),
        );

        console.log(
          "[GRID_AUTH] OWNER role granted:",
          session.email,
        );
      }
    } catch (err) {
      console.error(
        "[GRID_AUTH] Admin bootstrap failed:",
        err,
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Determine redirect destination
    // ─────────────────────────────────────────────────────────────

    const adminEmails =
      process.env.ADMIN_EMAILS
        ?.split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean) ?? [];

    const isAdmin =
      !!session.email &&
      adminEmails.includes(
        session.email.toLowerCase(),
      );

    const returnTo = isAdmin
      ? "/admin"
      : oauthState?.originalUri ?? "/";

    // ─────────────────────────────────────────────────────────────
    // Build response
    // ─────────────────────────────────────────────────────────────

    const response = successResponse(
      {
        memberId: session.memberId,
        returnTo,
      },
      200,
      request,
    );

    // ─────────────────────────────────────────────────────────────
    // Set encrypted session cookie
    // ─────────────────────────────────────────────────────────────

    await setSessionCookie(response, session);

    // ─────────────────────────────────────────────────────────────
    // Clear OAuth cookie
    // ─────────────────────────────────────────────────────────────

    clearOauthCookie(response);

    return response;
  } catch (error) {
    return handleRouteError(error, request);
  }
}