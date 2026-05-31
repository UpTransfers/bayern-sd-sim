import type { SimulationSummary } from "../types";
import { clamp } from "../utils";
import { deriveRosterEntryProfile } from "./playerModel";

export function computeFanConfidence(summary: SimulationSummary) {
  const attackBias = summary.signings.filter((item) => /(forward|wing|att|st|rw|lw)/i.test(item.position ?? "")).length * 4.5;
  const signingBuzz = summary.signings.reduce((score, signing) => {
    const approval = getSigningApproval(signing.raw_json);
    if (!approval) return score;
    const stageBoost = approval.stage === "greenlight" ? 2.8 : approval.stage === "negotiation" ? 1.1 : approval.stage === "board_review" ? -1.2 : -3.6;
    const fitBoost = (signing.tactical_fit_score - 70) * 0.04 + (signing.squad_need_score - 65) * 0.045;
    const feePenalty = signing.fee_eur >= 80 ? -1.5 : signing.fee_eur >= 55 ? -0.5 : 0;
    return score + stageBoost + fitBoost + feePenalty + Math.max(0, (approval.total - 60) / 20);
  }, 0);
  const activeStrength = rosterStrength(summary.activeRoster);
  const baselineStrength = rosterStrength(summary.baselineRoster ?? []);
  const strengthSwing = activeStrength - baselineStrength;
  const starSalesPenalty = Math.max(0, baselineStrength - activeStrength) * 0.38 + summary.soldPlayerIds.length * 1.2;
  const loanPenalty = summary.loanedPlayerIds.length * 0.8;
  const academyBoost = summary.loanReturnPool.length * 1.2 + summary.youthProspects.length * 1.5;
  const homeBias = summary.currentStanding ? Math.max(0, 8 - summary.currentStanding.position) : 4;
  const formBoost = summary.recentMatches.length
    ? summary.recentMatches.filter((match) => {
        const isBayernHome = /Bayern/i.test(match.home_team);
        const goalsFor = isBayernHome ? match.home_score ?? 0 : match.away_score ?? 0;
        const goalsAgainst = isBayernHome ? match.away_score ?? 0 : match.home_score ?? 0;
        return goalsFor > goalsAgainst;
      }).length * 4
    : 0;

  return clamp(
    Math.round(48 + attackBias + signingBuzz + academyBoost + homeBias + formBoost + Math.max(-6, strengthSwing * 0.55) - starSalesPenalty - loanPenalty),
    0,
    100,
  );
}

export function fanNarrative(fanConfidence: number) {
  if (fanConfidence >= 80) return "Supporters are excited about the direction.";
  if (fanConfidence >= 60) return "Supporters are cautiously optimistic.";
  if (fanConfidence >= 45) return "Supporters are split.";
  if (fanConfidence >= 30) return "Supporters are uneasy.";
  return "Supporter pressure is intense.";
}

function getSigningApproval(rawJson: unknown): { total: number; stage?: string } | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const approval = (rawJson as { approval?: unknown }).approval;
  if (!approval || typeof approval !== "object") return null;
  const candidate = approval as { total?: unknown; stage?: unknown };
  if (typeof candidate.total !== "number") return null;
  return {
    total: candidate.total,
    stage: typeof candidate.stage === "string" ? candidate.stage : undefined,
  };
}

function rosterStrength(roster: SimulationSummary["activeRoster"]) {
  if (!roster.length) return 0;
  const profiles = roster.map((entry) => deriveRosterEntryProfile(entry));
  const topGroup = profiles
    .map((profile) => profile.rating * 0.62 + profile.form * 0.38)
    .sort((a, b) => b - a)
    .slice(0, Math.min(11, profiles.length));
  if (!topGroup.length) return 0;
  return topGroup.reduce((sum, value) => sum + value, 0) / topGroup.length;
}
