import type { SimulationSummary } from "../types";
import { clamp, ordinal } from "../utils";
import { normalizeTactics, tacticalImpact } from "../simulation/tactics";
import { analyzeBayernLineup } from "./lineupImpact";

export function projectedPoints(summary: SimulationSummary, inputs: {
  squadBalance: number;
  tacticalFit: number;
  budgetEfficiency: number;
  boardConfidence: number;
  fanConfidence: number;
  mediaPressure: number;
  injuryVulnerability: number;
}) {
  const tactics = tacticalImpact(normalizeTactics(summary.simulation.tactics_json ?? null));
  const lineup = analyzeBayernLineup(summary, normalizeTactics(summary.simulation.tactics_json ?? null));
  const recentForm = summary.recentMatches.length
    ? summary.recentMatches.reduce((sum, match) => {
        const isBayernHome = /Bayern/i.test(match.home_team);
        const goalsFor = isBayernHome ? match.home_score ?? 0 : match.away_score ?? 0;
        const goalsAgainst = isBayernHome ? match.away_score ?? 0 : match.home_score ?? 0;
        if (goalsFor > goalsAgainst) return sum + 3;
        if (goalsFor === goalsAgainst) return sum + 1;
        return sum;
      }, 0) / summary.recentMatches.length
    : 1.9;

  const formBaseScore = recentForm * 10;
  const transferImpactScore =
    summary.signings.reduce((sum, signing) => sum + signing.tactical_fit_score * 0.14, 0) -
    summary.soldPlayerIds.length * 1.7 -
    summary.loanedPlayerIds.length * 1.1;

  const uncertaintyPenalty = Math.max(0, 20 - summary.simulation.data_confidence * 0.18);
  const depthRiskPenalty = inputs.injuryVulnerability * 0.18;
  const mediaPenalty = inputs.mediaPressure * 0.12;
  const rawPoints =
    formBaseScore +
    inputs.squadBalance * 0.2 +
    inputs.tacticalFit * 0.17 +
    lineup.startingQuality * 0.12 +
    lineup.chemistry * 0.08 +
    inputs.budgetEfficiency * 0.12 +
    inputs.boardConfidence * 0.08 +
    inputs.fanConfidence * 0.08 +
    transferImpactScore -
    depthRiskPenalty -
    mediaPenalty -
    uncertaintyPenalty +
    Math.max(0, lineup.threat - 70) * 0.05 +
    Math.max(0, lineup.control - 70) * 0.04 -
    lineup.outOfPositionCount * 0.7 -
    tactics.control * 0.1 +
    tactics.threat * 0.08 -
    tactics.risk * 0.09 -
    tactics.fatigue * 0.05 +
    tactics.chemistry * 0.04;

  return clamp(Math.round(rawPoints + 42), 55, 91);
}

export function projectedFinish(points: number) {
  if (points >= 80) return "1st";
  if (points >= 73) return "2nd";
  if (points >= 67) return "3rd";
  if (points >= 62) return "4th";
  if (points >= 57) return "5th";
  if (points >= 53) return "6th";
  if (points >= 49) return "7th";
  return ordinal(Math.max(8, Math.round(18 - (points - 34) / 3)));
}

export function verdictFromProjection(points: number, boardConfidence: number, risk: number) {
  if (points >= 80 && boardConfidence >= 70 && risk < 35) return "Title Contender";
  if (points >= 74) return "Strong Top-Three Finish";
  if (points >= 67) return "Competitive but Uneven";
  if (risk >= 75) return "Squad Crisis";
  if (boardConfidence < 45) return "Board Concern";
  return "Unstable but Dangerous";
}
