import { NextResponse } from "next/server";

import {
  getConversionRate,
  setConversionRate,
} from "@/server/economy";

export async function POST(
  request: Request,
) {

  try {

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
      conversionRate <= 0
    ) {

      return NextResponse.json(
        {
          error:
            "Invalid conversion rate",
        },
        {
          status: 400,
        },
      );
    }

    setConversionRate(
  conversionRate,
);

    return NextResponse.json({
      success: true,
      conversionRate:
  getConversionRate(),
    });

  } catch {

    return NextResponse.json(
      {
        error:
          "Failed to update economy",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET() {

  return NextResponse.json({
    conversionRate:
  getConversionRate(),
  });
}