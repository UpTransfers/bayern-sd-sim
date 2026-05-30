import { NextResponse } from "next/server";
import { syncTheSportsDB } from "@/lib/sync";

export async function POST() {
  const result = await syncTheSportsDB();
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
