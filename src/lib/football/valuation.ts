import type { PlayerRecord } from "../types";
import { clamp, roundToNearest } from "../utils";
import { ageBand, positionBucket } from "./normalize";

function positionMultiplier(position: string | null) {
  const bucket = positionBucket(position);
  switch (bucket) {
    case "GK":
      return 0.7;
    case "DEF":
      return 0.9;
    case "MID":
      return 1;
    case "ATT":
      return 1.15;
    default:
      return 0.85;
  }
}

export function estimateTransferFee(player: PlayerRecord, context?: {
  squadImportance?: number;
  sourceQuality?: number;
  goalContribution?: number;
  appearanceCount?: number;
}) {
  if (
    typeof player.transfer_value_min_eur_m === "number" &&
    typeof player.transfer_value_max_eur_m === "number"
  ) {
    const midpoint = (player.transfer_value_min_eur_m + player.transfer_value_max_eur_m) / 2;
    const age = player.age ?? 26;
    const ageAdjustment =
      age <= 21 ? 1.08 :
      age <= 24 ? 1.04 :
      age <= 28 ? 1 :
      age <= 31 ? 0.92 :
      0.84;
    const importance = clamp((context?.squadImportance ?? 55) / 55, 0.75, 1.15);
    const adjusted = clamp(midpoint * ageAdjustment * importance, player.transfer_value_min_eur_m, player.transfer_value_max_eur_m);
    return roundToNearest(adjusted, 1);
  }

  const age = player.age ?? 26;
  const ageMultiplier =
    age <= 19 ? 1.3 :
    age <= 22 ? 1.2 :
    age <= 25 ? 1.1 :
    age <= 28 ? 1.0 :
    age <= 31 ? 0.82 :
    0.65;

  const importanceMultiplier = clamp((context?.squadImportance ?? 55) / 55, 0.55, 1.65);
  const qualityMultiplier = clamp((context?.sourceQuality ?? player.data_confidence) / 100, 0.45, 1.2);
  const outputMultiplier = clamp(
    0.75 +
      ((context?.goalContribution ?? 0) * 0.03) +
      ((context?.appearanceCount ?? 0) * 0.005),
    0.75,
    1.35,
  );

  const agePositionFactor = ageMultiplier * positionMultiplier(player.position);
  const raw = 2.5 + (agePositionFactor * importanceMultiplier * qualityMultiplier * outputMultiplier * 18);
  return roundToNearest(clamp(raw, 2, 180), 1);
}

export function negotiateOutgoingTransfer(player: PlayerRecord, context?: {
  squadImportance?: number;
  buyerNeed?: number;
  minutes?: number;
  form?: number;
}) {
  const base = estimateTransferFee(player, {
    squadImportance: context?.squadImportance ?? player.data_confidence,
    sourceQuality: player.data_confidence,
    appearanceCount: context?.minutes ?? 0,
  });
  const buyerNeed = clamp((context?.buyerNeed ?? 50) / 50, 0.6, 1.25);
  const formLift = clamp((context?.form ?? player.data_confidence) / 75, 0.85, 1.18);
  const openingFee = roundToNearest(clamp(base * buyerNeed * 0.88, 1, 220), 1);
  const counterFee = roundToNearest(clamp(base * buyerNeed * 1.08 * formLift, openingFee, 240), 1);
  const finalFee = roundToNearest(clamp(base * buyerNeed * 0.98 * formLift, openingFee, counterFee), 1);
  const wageCoverage = clamp(Math.round(35 + (player.age ?? 26) * 1.5 + (player.data_confidence / 4)), 25, 85);
  const loanFee = roundToNearest(clamp(base * 0.12, 0.5, 8), 0.5);

  return {
    baseFee: base,
    openingFee,
    counterFee,
    finalFee,
    wageCoverage,
    loanFee,
    stance:
      base >= 40
        ? "Buyer will push for a discount, but the selling club has leverage."
        : base >= 15
        ? "Negotiation is realistic if Bayern are quick and keep the package clean."
        : "Seller should be open to a tidy deal if the player wants the move.",
  };
}

export function estimateSalaryPressure(player: PlayerRecord) {
  const base = player.position?.includes("F") ? 0.8 : player.position?.includes("MID") ? 0.65 : 0.5;
  return roundToNearest((player.age ?? 25) * base, 0.5);
}

export function valuationNarrative(player: PlayerRecord) {
  if (
    typeof player.transfer_value_min_eur_m === "number" &&
    typeof player.transfer_value_max_eur_m === "number"
  ) {
    return `${player.name} (${ageBand(player.age)}) is valued from the Bayern 2026/27 range ${player.transfer_value_min_eur_m}m-${player.transfer_value_max_eur_m}m, then adjusted by squad importance and role.`;
  }
  return `${player.name} (${ageBand(player.age)}) is valued using a deterministic simulator estimate based on age, role, data completeness, and squad importance.`;
}
