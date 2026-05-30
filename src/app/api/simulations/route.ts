import { NextResponse } from "next/server";
import { z } from "zod";
import { createSimulationRecord } from "@/lib/storage";
import { seasonLabelFromYear, currentSeasonStartYear } from "@/lib/simulation/service";

const schema = z.object({
  directorName: z.string().min(2),
  budget: z.number().int().min(0).max(500),
  seasonLabel: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid simulation payload" }, { status: 400 });
  }

  const simulation = await createSimulationRecord({
    directorName: parsed.data.directorName,
    selectedBudgetEur: parsed.data.budget,
    seasonLabel: parsed.data.seasonLabel ?? "2026-27 Planning",
  });

  return NextResponse.json({ id: simulation.id, seasonLabel: simulation.season_label });
}

export async function GET() {
  return NextResponse.json({
    seasonLabel: seasonLabelFromYear(currentSeasonStartYear()),
  });
}
