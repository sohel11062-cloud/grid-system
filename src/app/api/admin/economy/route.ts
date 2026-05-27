import { NextResponse } from "next/server";

let CURRENT_CONVERSION_RATE = 100;

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

    CURRENT_CONVERSION_RATE =
      conversionRate;

    return NextResponse.json({
      success: true,
      conversionRate:
        CURRENT_CONVERSION_RATE,
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
      CURRENT_CONVERSION_RATE,
  });
}