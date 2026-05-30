import type { TacticalSettings } from "../types";

export const defaultTactics: TacticalSettings = {
  pressingIntensity: 78,
  defensiveLineHeight: 76,
  pressingMode: "man",
  fullbackRole: "inverted",
  wingerWidth: 82,
  buildUpSpeed: 74,
  ballsInBehindRisk: 58,
  counterpressingAggression: 84,
  rotationLevel: 36,
  strikerDropDeep: 52,
  pivotSecurity: 58,
};

export function normalizeTactics(tactics?: Partial<TacticalSettings> | null): TacticalSettings {
  return {
    pressingIntensity: normalizeSlider(tactics?.pressingIntensity, defaultTactics.pressingIntensity),
    defensiveLineHeight: normalizeSlider(tactics?.defensiveLineHeight, defaultTactics.defensiveLineHeight),
    pressingMode: tactics?.pressingMode === "zonal" ? "zonal" : "man",
    fullbackRole:
      tactics?.fullbackRole === "wide" ? "wide" : tactics?.fullbackRole === "balanced" ? "balanced" : "inverted",
    wingerWidth: normalizeSlider(tactics?.wingerWidth, defaultTactics.wingerWidth),
    buildUpSpeed: normalizeSlider(tactics?.buildUpSpeed, defaultTactics.buildUpSpeed),
    ballsInBehindRisk: normalizeSlider(tactics?.ballsInBehindRisk, defaultTactics.ballsInBehindRisk),
    counterpressingAggression: normalizeSlider(tactics?.counterpressingAggression, defaultTactics.counterpressingAggression),
    rotationLevel: normalizeSlider(tactics?.rotationLevel, defaultTactics.rotationLevel),
    strikerDropDeep: normalizeSlider(tactics?.strikerDropDeep, defaultTactics.strikerDropDeep),
    pivotSecurity: normalizeSlider(tactics?.pivotSecurity, defaultTactics.pivotSecurity),
  };
}

function normalizeSlider(value: unknown, fallback: number) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function tacticsSummary(tactics: TacticalSettings) {
  const forwardRisk = Math.round((tactics.pressingIntensity + tactics.defensiveLineHeight + tactics.counterpressingAggression) / 3);
  const control = Math.round((100 - Math.abs(tactics.buildUpSpeed - 72)) * 0.25 + tactics.pivotSecurity * 0.35 + tactics.strikerDropDeep * 0.2);
  const width = Math.round((tactics.wingerWidth + (tactics.fullbackRole === "wide" ? 18 : tactics.fullbackRole === "balanced" ? 8 : 0)) / 1.3);
  return {
    pressingLoad: forwardRisk,
    control,
    width,
  };
}

export function tacticalImpact(tactics: TacticalSettings) {
  const widthBonus = tactics.fullbackRole === "wide" ? -4 : tactics.fullbackRole === "balanced" ? 0 : 5;
  const control =
    tactics.pivotSecurity * 0.34 +
    (100 - Math.abs(tactics.buildUpSpeed - 72)) * 0.18 +
    (tactics.wingerWidth * 0.08) +
    (tactics.counterpressingAggression * 0.1) +
    widthBonus;
  const threat =
    tactics.buildUpSpeed * 0.22 +
    tactics.wingerWidth * 0.16 +
    tactics.ballsInBehindRisk * 0.12 +
    tactics.strikerDropDeep * 0.1 +
    (tactics.pressingMode === "man" ? 3 : -1);
  const risk =
    tactics.pressingIntensity * 0.14 +
    tactics.defensiveLineHeight * 0.15 +
    tactics.ballsInBehindRisk * 0.18 +
    (tactics.pressingMode === "man" ? 6 : 1);
  const fatigue =
    tactics.pressingIntensity * 0.12 +
    tactics.counterpressingAggression * 0.1 +
    (100 - tactics.rotationLevel) * 0.1 +
    Math.max(0, tactics.defensiveLineHeight - 70) * 0.05;
  const chemistry =
    tactics.rotationLevel * 0.15 +
    (100 - Math.abs(tactics.strikerDropDeep - 50)) * 0.08 +
    (100 - Math.abs(tactics.pivotSecurity - 60)) * 0.06;

  return {
    control: Math.round(control),
    threat: Math.round(threat),
    risk: Math.round(risk),
    fatigue: Math.round(fatigue),
    chemistry: Math.round(chemistry),
  };
}
