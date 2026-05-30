import { clamp } from "../utils";

export const POKAL_STAGE_CUMULATIVE_TARGETS = [0.975, 0.873, 0.729, 0.593, 0.473, 0.369, 0.284] as const;

export const UCL_TARGETS = {
  top8: 0.76,
  top24: 0.99,
  playoffWin: 0.74,
  directKnockoutWin: 0.62,
  title: 0.1346,
} as const;

export function leaguePriorWeightForClub(club: string, volatility: number) {
  if (club === "Bayern Munich") {
    const shift = clamp((volatility - 40) * 0.002, -0.1, 0.06);
    return clamp(0.52 - shift, 0.38, 0.58);
  }
  const volatilityShift = Math.max(-0.08, Math.min(0.12, (volatility - 40) * 0.0025));
  return clamp(0.68 - volatilityShift, 0.5, 0.8);
}

export function pokalSurvivalTarget(roundIndex: number) {
  return POKAL_STAGE_CUMULATIVE_TARGETS[Math.max(0, Math.min(roundIndex, POKAL_STAGE_CUMULATIVE_TARGETS.length - 1))];
}

export function pokalConditionalWinTarget(roundIndex: number) {
  const current = pokalSurvivalTarget(roundIndex);
  const previous = roundIndex <= 0 ? 1 : pokalSurvivalTarget(roundIndex - 1);
  return clamp(current / previous, 0.65, 0.99);
}

export function uclKnockoutTarget(stage: "playoff" | "round16" | "quarter" | "semi" | "final") {
  if (stage === "playoff") return UCL_TARGETS.playoffWin;
  return UCL_TARGETS.directKnockoutWin;
}

export function uclTargetRankBand(isDirectQualification: boolean) {
  return isDirectQualification ? { min: 1, max: 8 } : { min: 9, max: 24 };
}
