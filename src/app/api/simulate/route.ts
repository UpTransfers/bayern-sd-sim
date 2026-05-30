import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSimulationSummary, commitSimulationResult, getSimulationReadinessIssues } from "@/lib/simulation/service";

const schema = z.object({
  simulationId: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const summary = await buildSimulationSummary(parsed.data.simulationId);
  if (!summary) {
    return NextResponse.json({ error: "Could not load simulation" }, { status: 400 });
  }
  const readinessIssues = getSimulationReadinessIssues(summary);
  if (readinessIssues.length) {
    return NextResponse.json({ error: "Simulation setup incomplete", issues: readinessIssues }, { status: 422 });
  }

  const result = await commitSimulationResult(parsed.data.simulationId);
  if (!result) {
    return NextResponse.json({ error: "Could not simulate" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result });
}
