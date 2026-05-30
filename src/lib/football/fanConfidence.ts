import type { SimulationSummary } from "../types";
import { clamp } from "../utils";

export function computeFanConfidence(summary: SimulationSummary) {
  const attackBias =
    summary.signings.filter((item) => /(forward|wing|att)/i.test(item.position ?? "")).length * 6;
  const approvalBias = summary.signings.reduce((score, signing) => {
    const approval = getSigningApproval(signing.raw_json);
    if (!approval) return score;
    if (approval.stage === "greenlight") return score + Math.min(4, Math.round(approval.total / 25));
    if (approval.stage === "negotiation") return score + 1;
    if (approval.stage === "board_review") return score - 1;
    return score - 3;
  }, 0);
  const starSalesPenalty = summary.soldPlayerIds.length * 2.5;
  const loanPenalty = summary.loanedPlayerIds.length * 1.5;
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
    Math.round(50 + attackBias + approvalBias + homeBias + formBoost - starSalesPenalty - loanPenalty),
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
