import { NextResponse } from "next/server";
import { syncOpenLigaDB } from "@/lib/sync";

export async function POST() {
  const result = await syncOpenLigaDB();
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
