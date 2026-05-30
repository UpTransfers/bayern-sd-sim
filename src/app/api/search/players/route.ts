import { NextResponse } from "next/server";
import { searchPlayersAcrossSources } from "@/lib/sync";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const simulationId = searchParams.get("simulationId");
  const results = await searchPlayersAcrossSources(query, simulationId);
  return NextResponse.json({ results });
}
