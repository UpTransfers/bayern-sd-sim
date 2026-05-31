import type { SimulationSummary } from "../types";
import { clamp } from "../utils";
import { normalizeTactics, tacticalImpact } from "../simulation/tactics";
import { analyzeBayernLineup } from "./lineupImpact";
import { deriveRosterEntryProfile } from "./playerModel";

export function computeBoardConfidence(summary: SimulationSummary) {
  const tactics = tacticalImpact(normalizeTactics(summary.simulation.tactics_json ?? null));
  const lineup = analyzeBayernLineup(summary, normalizeTactics(summary.simulation.tactics_json ?? null));
  const completed = Math.min(6, summary.simulation.completed_tasks.length * 1.4);
  const dataScore = summary.simulation.data_confidence * 0.16;
  const activeStrength = rosterStrength(summary.activeRoster);
  const baselineStrength = rosterStrength(summary.baselineRoster ?? []);
  const rosterDelta = activeStrength - baselineStrength;
  const transferBalance =
    summary.signings.length * 1.4 -
    summary.soldPlayerIds.length * 1.6 -
    summary.loanedPlayerIds.length * 0.8 +
    Math.max(0, rosterDelta) * 0.12 -
    Math.max(0, -rosterDelta) * 0.24;
  const approvalSignals = summary.signings.reduce(
    (score, signing) => {
      const approval = getSigningApproval(signing.raw_json);
      if (!approval) return score;
      const stageBoost =
        approval.stage === "greenlight"
          ? 3.5
          : approval.stage === "negotiation"
          ? 1.2
          : approval.stage === "board_review"
          ? -1.4
          : -4.5;
      const totalBoost = (approval.total - 60) / 14;
      const fitBoost = (signing.tactical_fit_score - 70) * 0.04 + (signing.squad_need_score - 65) * 0.035;
      const feeDrag = signing.fee_eur >= 80 ? -2.2 : signing.fee_eur >= 55 ? -0.8 : 0;
      const vetoPenalty = approval.vetoReasons?.length ? Math.min(4, approval.vetoReasons.length * 1.2) : 0;
      return score + stageBoost + totalBoost + fitBoost + feeDrag - vetoPenalty;
    },
    0,
  );
  const depthPenalty = summary.activeRoster.length < 18 ? 10 : summary.activeRoster.length > 30 ? 6 : 0;
  const tacticalBoost = summary.lineup ? summary.lineup.tactical_score * 0.07 + lineup.control * 0.08 + lineup.chemistry * 0.05 : 0;
  return clamp(
    Math.round(
      46 +
        completed +
        dataScore +
        transferBalance +
        tacticalBoost +
        tactics.control * 0.1 +
        lineup.startingQuality * 0.05 -
        lineup.outOfPositionCount * 1.4 -
        tactics.fatigue * 0.05 -
        depthPenalty +
        approvalSignals,
    ),
    0,
    100,
  );
}

export function boardVerdict(boardConfidence: number) {
  if (boardConfidence >= 80) return "Board is fully aligned.";
  if (boardConfidence >= 65) return "Board is supportive, with mild caution.";
  if (boardConfidence >= 50) return "Board is watching closely.";
  if (boardConfidence >= 35) return "Board concern is growing.";
  return "Board confidence is under severe pressure.";
}

export function boardObjectives(ctx?: {
  lastFinish?: number;
  lastTrophies?: string[];
  injuryRisk?: number;
  budgetEfficiency?: number;
}) {
  if (!ctx) {
    return [
      "Defend the Bundesliga title",
      "Reach the Champions League semi-final conversation",
      "Keep wage and transfer discipline",
      "Protect the academy pathway",
      "Avoid excessive squad turnover",
      "Maintain fan confidence",
    ];
  }
  const objectives = ["Maintain Champions League-level squad quality"];
  objectives.push(ctx.lastFinish && ctx.lastFinish >= 3 ? "Return to Bundesliga top 2" : "Defend the Bundesliga title");
  objectives.push(ctx.lastTrophies?.includes("Champions League") ? "Stay in the UCL title tier" : "Reach at least the UCL quarter-final");
  if (!ctx.lastTrophies?.length) objectives.push("Win a trophy under pressure");
  if (ctx.injuryRisk && ctx.injuryRisk >= 65) objectives.push("Reduce squad injury exposure");
  if (ctx.budgetEfficiency && ctx.budgetEfficiency < 55) objectives.push("Tighten transfer spending");
  objectives.push("Keep the Bayern wage hierarchy intact");
  return objectives.slice(0, 6);
}

function getSigningApproval(rawJson: unknown): { total: number; stage?: string; vetoReasons?: string[] } | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const approval = (rawJson as { approval?: unknown }).approval;
  if (!approval || typeof approval !== "object") return null;
  const candidate = approval as { total?: unknown; stage?: unknown; vetoReasons?: unknown };
  const total = typeof candidate.total === "number" ? candidate.total : null;
  if (total === null) return null;
  return {
    total,
    stage: typeof candidate.stage === "string" ? candidate.stage : undefined,
    vetoReasons: Array.isArray(candidate.vetoReasons) ? candidate.vetoReasons.filter((item): item is string => typeof item === "string") : undefined,
  };
}

function rosterStrength(roster: SimulationSummary["activeRoster"]) {
  if (!roster.length) return 0;
  const profiles = roster.map((entry) => deriveRosterEntryProfile(entry));
  const topGroup = profiles
    .map((profile) => profile.rating * 0.64 + profile.form * 0.36)
    .sort((a, b) => b - a)
    .slice(0, Math.min(11, profiles.length));
  if (!topGroup.length) return 0;
  return topGroup.reduce((sum, value) => sum + value, 0) / topGroup.length;
}
