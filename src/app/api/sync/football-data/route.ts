import { NextResponse } from "next/server";
import { syncFootballData } from "@/lib/sync";

export async function POST() {
  const result = await syncFootballData();
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
