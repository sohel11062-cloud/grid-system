import {
  NextRequest,
} from "next/server";

import {
  DEFAULT_CREDS_PER_RUPEE,
  normalizeCredsPerRupee,
} from "@/lib/grid";

import { requireAdmin } from "@/server/admin-auth";

import {
  getConversionRate,
  setConversionRate,
} from "@/server/economy";

import {
  AppError,
  ErrorCode,
} from "@/server/errors";

import {
  handleRouteError,
  optionsResponse,
  successResponse,
} from "@/server/http";

export async function OPTIONS(
  request: NextRequest,
) {
  return optionsResponse(request);
}

export async function POST(
  request: NextRequest,
) {

  try {

    const auth =
      await requireAdmin(
        request,
        "owner",
      );

    const body =
      await request.json();

    const conversionRate =
      Number(
        body.conversionRate,
      );

    if (
      !Number.isFinite(
        conversionRate,
      ) ||
      conversionRate <= 0 ||
      !Number.isInteger(
        conversionRate,
      )
    ) {

      throw new AppError(
        "Invalid conversion rate",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    await setConversionRate(
      normalizeCredsPerRupee(
        conversionRate,
      ),
      auth.user.memberId,
    );

    const savedConversionRate =
      normalizeCredsPerRupee(
        Number(
          await getConversionRate(),
        ),
      );

    return successResponse(
      {
        conversionRate:
          savedConversionRate,
        message:
          `Economy updated: ${savedConversionRate} Creds = ₹1.`,
      },
      200,
      request,
    );

  } catch (error) {

    return handleRouteError(
      error,
      request,
    );
  }
}

export async function GET(
  request: NextRequest,
) {

  const conversionRate =
    normalizeCredsPerRupee(
      Number(
        await getConversionRate(),
      ) || DEFAULT_CREDS_PER_RUPEE,
    );

  return successResponse(
    {
      conversionRate:
        conversionRate,
    },
    200,
    request,
  );
}
