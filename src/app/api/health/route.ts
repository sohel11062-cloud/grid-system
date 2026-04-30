import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "THE_GRID",
    timestamp: new Date().toISOString()
  });
}
