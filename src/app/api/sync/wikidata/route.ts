import { NextResponse } from "next/server";
import { syncWikidata } from "@/lib/sync";

export async function POST() {
  const result = await syncWikidata();
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
