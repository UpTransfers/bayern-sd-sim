import type { BoardSaleStance, PlayerImportance, WageTier } from "@/lib/types";
import { clamp } from "@/lib/utils";

export type DecisionImpactPreview = {
  budgetDelta: number;
  wageDelta: number;
  squadDepthDelta: number;
  boardConfidenceDelta: number;
  fanConfidenceDelta: number;
  mediaPressureDelta: number;
  tacticalFitDelta: number;
  youthPathwayDelta: number;
  replacementRisk: number;
  severity: "positive" | "neutral" | "warning" | "danger";
  reasons: string[];
};

type ImpactKind = "sale" | "loan" | "signing" | "formation";

type ImpactDraft = Omit<DecisionImpactPreview, "severity"> & {
  severityScore: number;
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function weightByImportance(importance?: PlayerImportance | null): number {
  switch (importance) {
    case "core":
      return 1.55;
    case "starter":
      return 1.25;
    case "rotation":
      return 0.95;
    case "development":
      return 0.8;
    case "sellable":
      return 0.9;
    case "loan_candidate":
      return 0.85;
    case "emergency_depth":
      return 0.75;
    default:
      return 1;
  }
}

function wagePressureWeight(tier?: WageTier | null): number {
  switch (tier) {
    case "superstar":
      return 2.2;
    case "elite":
      return 1.7;
    case "high":
      return 1.25;
    case "mid":
      return 0.9;
    case "low":
      return 0.6;
    default:
      return 1;
  }
}

function boardStanceWeight(stance?: BoardSaleStance | null): number {
  switch (stance) {
    case "retain":
      return 1.2;
    case "sale_if_upgrade":
      return 0.92;
    case "must_sell":
      return 0.7;
    case "open_to_sale":
      return 0.82;
    case "block":
      return 1.35;
    default:
      return 1;
  }
}

function riskBandLabel(risk: number): "low" | "medium" | "high" | "severe" {
  if (risk <= 20) return "low";
  if (risk <= 45) return "medium";
  if (risk <= 70) return "high";
  return "severe";
}

function replacementRiskFromContext({
  importance,
  replacementQuality = 0,
  squadDepthBefore = 0,
  tacticalImportance = 50,
}: {
  importance?: PlayerImportance | null;
  replacementQuality?: number;
  squadDepthBefore?: number;
  tacticalImportance?: number;
}): number {
  const importanceBoost =
    importance === "core" ? 36 :
    importance === "starter" ? 26 :
    importance === "rotation" ? 14 :
    importance === "development" ? 7 :
    importance === "loan_candidate" ? 10 :
    importance === "emergency_depth" ? 5 :
    12;
  const qualityOffset = Math.max(0, 68 - replacementQuality) * 0.7;
  const depthOffset = Math.max(0, 72 - squadDepthBefore) * 0.55;
  const tacticalOffset = Math.max(0, tacticalImportance - 50) * 0.3;
  return clamp(Math.round(12 + importanceBoost + qualityOffset + depthOffset + tacticalOffset), 0, 100);
}

function severityFromScore(score: number, kind: ImpactKind, risk: number): DecisionImpactPreview["severity"] {
  if (kind === "sale" && risk >= 55) return "danger";
  if (kind === "signing" && score <= -9) return "danger";
  if (kind === "loan" && score <= -4) return "warning";
  if (kind === "formation" && score <= -5) return "warning";
  if (score >= 4) return "positive";
  if (score <= -3) return "warning";
  return "neutral";
}

function buildPreview(kind: ImpactKind, draft: ImpactDraft): DecisionImpactPreview {
  return {
    ...draft,
    budgetDelta: round(draft.budgetDelta),
    wageDelta: round(draft.wageDelta),
    squadDepthDelta: round(draft.squadDepthDelta),
    boardConfidenceDelta: round(draft.boardConfidenceDelta),
    fanConfidenceDelta: round(draft.fanConfidenceDelta),
    mediaPressureDelta: round(draft.mediaPressureDelta),
    tacticalFitDelta: round(draft.tacticalFitDelta),
    youthPathwayDelta: round(draft.youthPathwayDelta),
    replacementRisk: clamp(Math.round(draft.replacementRisk), 0, 100),
    severity: severityFromScore(draft.boardConfidenceDelta + draft.fanConfidenceDelta + draft.tacticalFitDelta + draft.youthPathwayDelta - draft.mediaPressureDelta - draft.replacementRisk * 0.05, kind, draft.replacementRisk),
    reasons: draft.reasons.slice(0, 5),
  };
}

function pushReason(reasons: string[], text: string): void {
  if (!reasons.includes(text)) reasons.push(text);
}

function depthShift(importance?: PlayerImportance | null): number {
  switch (importance) {
    case "core":
      return -2.3;
    case "starter":
      return -1.8;
    case "rotation":
      return -0.9;
    case "development":
      return -0.4;
    case "loan_candidate":
      return -0.7;
    case "sellable":
      return -0.6;
    default:
      return -0.5;
  }
}

function riskReason(risk: number): string | null {
  const band = riskBandLabel(risk);
  if (band === "low") return null;
  return `Replacement risk is ${band}, so a backup plan matters.`;
}

export function previewSaleImpact(input: {
  playerId: string;
  playerName: string;
  playerImportance?: PlayerImportance | null;
  wageTier?: WageTier | null;
  boardSaleStance?: BoardSaleStance | null;
  transferFeeEurM: number;
  replacementQuality?: number;
  squadDepthBefore?: number;
  tacticalImportance?: number;
  youthPathwayValue?: number;
}): DecisionImpactPreview {
  const reasons: string[] = [];
  const importanceWeight = weightByImportance(input.playerImportance);
  const wageWeight = wagePressureWeight(input.wageTier);
  const stanceWeight = boardStanceWeight(input.boardSaleStance);
  const replacementQuality = input.replacementQuality ?? 0;
  const squadDepthBefore = input.squadDepthBefore ?? 72;
  const tacticalImportance = input.tacticalImportance ?? 50;
  const youthPathwayValue = input.youthPathwayValue ?? 0;

  const replacementRisk = replacementRiskFromContext({
    importance: input.playerImportance,
    replacementQuality,
    squadDepthBefore,
    tacticalImportance,
  });

  const budgetDelta = input.transferFeeEurM;
  const wageDelta = Math.max(0, wageWeight - 1) * 1.4 + (input.playerImportance === "core" ? -0.3 : 0.5);
  const squadDepthDelta = depthShift(input.playerImportance);
  const tacticalFitDelta =
    -(Math.max(0, tacticalImportance - 40) * 0.12 * importanceWeight) +
    (input.playerImportance === "rotation" || input.playerImportance === "sellable" ? 0.4 : 0);
  const youthPathwayDelta =
    -(Math.max(0, youthPathwayValue) * 0.06 * importanceWeight) +
    (input.playerImportance === "development" ? 0.8 : 0) +
    (input.playerImportance === "rotation" ? 0.1 : 0);

  let boardConfidenceDelta = 12 - replacementRisk * 0.28;
  boardConfidenceDelta += input.boardSaleStance === "must_sell" ? 2.2 : 0;
  boardConfidenceDelta -= input.boardSaleStance === "retain" || input.boardSaleStance === "block" ? 4.5 : 0;
  boardConfidenceDelta += (1 - stanceWeight) * 3.2;
  boardConfidenceDelta += input.wageTier === "superstar" || input.wageTier === "elite" ? 1.2 : 0;
  boardConfidenceDelta += input.playerImportance === "rotation" || input.playerImportance === "sellable" ? 1.0 : 0;
  boardConfidenceDelta += wageDelta * 0.2;

  let fanConfidenceDelta = 10 - replacementRisk * 0.2;
  fanConfidenceDelta -= input.playerImportance === "core" ? 8.5 : 0;
  fanConfidenceDelta -= input.playerImportance === "starter" ? 4.5 : 0;
  fanConfidenceDelta += input.playerImportance === "rotation" ? 1.4 : 0;
  fanConfidenceDelta += input.playerImportance === "sellable" ? 2.2 : 0;
  fanConfidenceDelta += replacementQuality >= 70 ? 2.6 : replacementQuality >= 60 ? 1.0 : 0;
  if (input.playerImportance === "sellable") {
    fanConfidenceDelta = Math.min(fanConfidenceDelta, 4);
  }
  if (input.playerImportance === "rotation" && input.boardSaleStance !== "must_sell") {
    fanConfidenceDelta = Math.min(fanConfidenceDelta, 2.5);
  }

  const mediaPressureDelta =
    -0.4 +
    (input.playerImportance === "core" ? 3.2 : 0) +
    (input.playerImportance === "starter" ? 1.2 : 0) +
    (replacementQuality >= 70 ? -0.4 : 0.3) +
    (replacementRisk >= 46 ? 0.8 : 0) +
    (input.boardSaleStance === "retain" || input.boardSaleStance === "block" ? 0.7 : 0);

  addReasonSet(reasons, [
    `${input.playerName} sale brings in €${round(input.transferFeeEurM)}m.`,
    input.playerImportance === "core" || input.playerImportance === "starter"
      ? "Selling a key player needs a strong replacement plan."
      : "The squad can absorb this exit more easily than a star sale.",
    replacementQuality >= 70
      ? "A credible replacement softens the blow for the board and fan base."
      : "A weak replacement plan increases depth risk and backlash.",
  ]);
  if (input.boardSaleStance === "retain" || input.boardSaleStance === "block") {
    pushReason(reasons, "The board is already cautious about selling him.");
  }
  if (wageDelta > 0.5) {
    pushReason(reasons, "The wage relief is a real part of the sale case.");
  }
  const riskText = riskReason(replacementRisk);
  if (riskText) pushReason(reasons, riskText);

  return buildPreview("sale", {
    budgetDelta,
    wageDelta,
    squadDepthDelta,
    boardConfidenceDelta,
    fanConfidenceDelta,
    mediaPressureDelta,
    tacticalFitDelta,
    youthPathwayDelta,
    replacementRisk,
    reasons,
    severityScore: boardConfidenceDelta + fanConfidenceDelta - mediaPressureDelta - replacementRisk * 0.08,
  });
}

export function previewLoanImpact(input: {
  playerId: string;
  playerName: string;
  playerImportance?: PlayerImportance | null;
  wageTier?: WageTier | null;
  age?: number | null;
  pathwayValue?: number;
  wageCoveragePercent?: number;
  minutesPromise?: boolean;
  squadDepthBefore?: number;
  tacticalImportance?: number;
}): DecisionImpactPreview {
  const reasons: string[] = [];
  const importanceWeight = weightByImportance(input.playerImportance);
  const age = input.age ?? 24;
  const wageCoveragePercent = input.wageCoveragePercent ?? 0;
  const minutesPromise = Boolean(input.minutesPromise);
  const squadDepthBefore = input.squadDepthBefore ?? 72;
  const tacticalImportance = input.tacticalImportance ?? 50;

  const replacementRisk = clamp(
    Math.round(
      10 +
        Math.max(0, 72 - squadDepthBefore) * 0.38 +
        (input.playerImportance === "core" ? 34 : input.playerImportance === "starter" ? 24 : input.playerImportance === "rotation" ? 16 : 6) +
        (tacticalImportance > 60 ? 5 : 0) -
        (wageCoveragePercent > 0 ? 4 : 0),
    ),
    0,
    100,
  );

  const budgetDelta = wageCoveragePercent / 100;
  const wageDelta = wageCoveragePercent / 100;
  const squadDepthDelta = depthShift(input.playerImportance) * 0.5;
  const pathwayPositive = age <= 23 && (input.playerImportance === "development" || input.playerImportance === "loan_candidate");
  const pathwayDelta =
    (pathwayPositive ? 1.2 : -0.8) +
    (age <= 21 ? 0.5 : 0) -
    (input.playerImportance === "rotation" || input.playerImportance === "starter" || input.playerImportance === "core" ? 1.1 : 0) +
    (minutesPromise ? 0.4 : -0.4);

  let boardConfidenceDelta = 0.2 + (wageCoveragePercent / 100) * 1.2 + (pathwayPositive && minutesPromise ? 0.9 : 0);
  boardConfidenceDelta -= importanceWeight > 1 ? 2.8 : 0;
  boardConfidenceDelta -= tacticalImportance > 65 ? 1.0 : 0;
  boardConfidenceDelta += wageDelta * 0.3;
  boardConfidenceDelta += pathwayDelta * 0.1;

  let fanConfidenceDelta = (pathwayPositive && minutesPromise ? 1.6 : 0.2) - (importanceWeight > 1 ? 2.4 : 0);
  fanConfidenceDelta += age <= 21 ? 0.6 : 0;
  fanConfidenceDelta -= minutesPromise ? 0 : 0.8;
  fanConfidenceDelta += pathwayDelta * 0.12;
  if (input.playerImportance === "rotation") fanConfidenceDelta = Math.min(fanConfidenceDelta, 0.8);
  if (input.playerImportance === "development" && minutesPromise) fanConfidenceDelta = Math.max(fanConfidenceDelta, 1.5);

  const tacticalFitDelta = round(depthShift(input.playerImportance) * 0.3 + (minutesPromise ? 0.5 : -0.2));
  const youthPathwayDelta = pathwayDelta;
  const mediaPressureDelta = -0.5 + (importanceWeight > 1 ? 1.8 : 0.2) + (replacementRisk >= 46 ? 0.8 : 0) + (pathwayPositive && minutesPromise ? -0.4 : 0);

  addReasonSet(reasons, [
    `${input.playerName} leaves on loan with ${minutesPromise ? "a minutes promise" : "no guaranteed minutes"} in place.`,
    wageCoveragePercent > 0
      ? `The loan covers about ${round(wageCoveragePercent)}% of wages, which eases the financial hit.`
      : "There is little or no wage coverage, so the financial relief is limited.",
    pathwayPositive && minutesPromise
      ? "This is a sensible development move because the player is young enough to benefit from regular football."
      : "If the player is already important, the loan starts to look more like a depth problem than development.",
  ]);
  if (importanceWeight > 1) {
    pushReason(reasons, "Loaning a needed player reduces depth and should be treated cautiously.");
  }
  if (!minutesPromise) {
    pushReason(reasons, "Without a minutes promise, the pathway value is weaker.");
  }
  const riskText = riskReason(replacementRisk);
  if (riskText) pushReason(reasons, riskText);

  return buildPreview("loan", {
    budgetDelta,
    wageDelta,
    squadDepthDelta,
    boardConfidenceDelta,
    fanConfidenceDelta,
    mediaPressureDelta,
    tacticalFitDelta,
    youthPathwayDelta,
    replacementRisk,
    reasons,
    severityScore: boardConfidenceDelta + fanConfidenceDelta + pathwayDelta - mediaPressureDelta - replacementRisk * 0.06,
  });
}

export function previewSigningImpact(input: {
  playerId: string;
  playerName: string;
  feeEurM: number;
  wageDemandTier?: WageTier | null;
  targetImportance?: PlayerImportance | null;
  tacticalFit?: number;
  squadNeed?: number;
  injuryRisk?: number;
  contractYears?: number;
  blocksYouthPathway?: boolean;
  replacementQuality?: number;
  sellerResistance?: number;
}): DecisionImpactPreview {
  const reasons: string[] = [];
  const wageWeight = wagePressureWeight(input.wageDemandTier);
  const tacticalFit = input.tacticalFit ?? 50;
  const squadNeed = input.squadNeed ?? 50;
  const injuryRisk = input.injuryRisk ?? 25;
  const contractYears = input.contractYears ?? 3;
  const blocksYouthPathway = Boolean(input.blocksYouthPathway);
  const replacementQuality = input.replacementQuality ?? 0;
  const sellerResistance = input.sellerResistance ?? 0;

  const budgetDelta = -input.feeEurM;
  const wageDelta = -(wageWeight - 1) * 2;
  const tacticalFitDelta = (tacticalFit - 50) * 0.09 + (squadNeed - 50) * 0.06;
  const squadDepthDelta =
    input.targetImportance === "core" ? 2.1 :
    input.targetImportance === "starter" ? 1.7 :
    input.targetImportance === "rotation" ? 1.1 :
    0.8;
  const youthPathwayDelta = (blocksYouthPathway ? -1.8 : 0) + (input.targetImportance === "development" ? 0.5 : 0);
  const replacementRisk = clamp(
    Math.round(
      8 +
        Math.max(0, 68 - tacticalFit) * 0.4 +
        Math.max(0, 62 - squadNeed) * 0.24 +
        (blocksYouthPathway ? 10 : 0) +
        Math.max(0, injuryRisk - 30) * 0.35 +
        (input.targetImportance === "core" ? 14 : input.targetImportance === "starter" ? 10 : 3),
    ),
    0,
    100,
  );

  let boardConfidenceDelta =
    (squadNeed - 50) * 0.1 +
    (tacticalFit - 50) * 0.09 -
    (input.feeEurM * 0.07) -
    (wageWeight - 1) * 1.9 -
    Math.max(0, injuryRisk - 25) * 0.04 -
    (blocksYouthPathway ? 1.6 : 0) -
    (sellerResistance > 65 ? 1.4 : 0);
  boardConfidenceDelta += Math.max(0, replacementQuality - 60) * 0.04;
  boardConfidenceDelta -= Math.max(0, contractYears - 4) * 0.12;
  boardConfidenceDelta += wageDelta * 0.35;
  if (input.targetImportance === "core" || input.targetImportance === "starter") {
    boardConfidenceDelta += 1.8;
  }
  if (input.targetImportance === "development") {
    boardConfidenceDelta += 0.7;
  }

  let fanConfidenceDelta =
    (squadNeed - 50) * 0.08 +
    (tacticalFit - 50) * 0.08 -
    (input.feeEurM * 0.04) -
    Math.max(0, injuryRisk - 25) * 0.03 -
    (blocksYouthPathway ? 1.2 : 0);
  fanConfidenceDelta += Math.max(0, replacementQuality - 60) * 0.02;
  fanConfidenceDelta += input.targetImportance === "core" || input.targetImportance === "starter" ? 1.4 : 0;
  fanConfidenceDelta -= input.targetImportance === "rotation" ? 0.4 : 0;
  fanConfidenceDelta += youthPathwayDelta * 0.08;
  if (input.targetImportance === "rotation" || input.targetImportance === "sellable") {
    fanConfidenceDelta = Math.min(fanConfidenceDelta, 4);
  }

  const mediaPressureDelta =
    -0.1 +
    Math.max(0, input.feeEurM - 35) * 0.06 +
    Math.max(0, wageWeight - 1) * 0.8 +
    Math.max(0, sellerResistance - 50) * 0.02 -
    Math.max(0, squadNeed - 50) * 0.04 -
    Math.max(0, tacticalFit - 50) * 0.03 +
    (input.targetImportance === "core" ? 0.8 : input.targetImportance === "starter" ? 0.2 : 0);
  const severityScore = boardConfidenceDelta + fanConfidenceDelta + tacticalFitDelta + squadDepthDelta - mediaPressureDelta - replacementRisk * 0.08;

  addReasonSet(reasons, [
    `${input.playerName} costs about €${round(input.feeEurM)}m, so the fee matters immediately.`,
    tacticalFit >= 60
      ? "The player fits the tactical plan well, which helps the sporting case."
      : "The tactical fit is only moderate, so the move needs stronger squad logic to justify it.",
    squadNeed >= 60
      ? "The position need is real enough to support the move."
      : "The squad need is not urgent, so this starts to look like a luxury signing.",
  ]);
  if (wageWeight >= 1.7) {
    pushReason(reasons, "High wage demand increases board caution and can upset wage structure.");
  }
  if (injuryRisk >= 40) {
    pushReason(reasons, "Injury risk reduces how much confidence the board should place in the signing.");
  }
  if (blocksYouthPathway) {
    pushReason(reasons, "Blocking a young player's pathway is a real negative for a club that wants balance.");
  }
  if (sellerResistance >= 70) {
    pushReason(reasons, "High seller resistance means the deal is likely to drag and attract more caution.");
  }
  if (input.targetImportance === "core" || input.targetImportance === "starter") {
    pushReason(reasons, "A needed starter can still be worth the money if the fit is strong enough.");
  } else {
    pushReason(reasons, "A luxury move needs better value and lower wages to avoid board backlash.");
  }
  const riskText = riskReason(replacementRisk);
  if (riskText) pushReason(reasons, riskText);

  return buildPreview("signing", {
    budgetDelta,
    wageDelta,
    squadDepthDelta,
    boardConfidenceDelta,
    fanConfidenceDelta,
    mediaPressureDelta,
    tacticalFitDelta,
    youthPathwayDelta,
    replacementRisk,
    reasons,
    severityScore,
  });
}

export function previewFormationImpact(input: {
  formation: string;
  selectedXIQuality?: number;
  benchQuality?: number;
  outOfPositionCount?: number;
  tacticalFit?: number;
  fatigueRisk?: number;
  defensiveRisk?: number;
}): DecisionImpactPreview {
  const reasons: string[] = [];
  const selectedXIQuality = input.selectedXIQuality ?? 70;
  const benchQuality = input.benchQuality ?? 68;
  const outOfPositionCount = input.outOfPositionCount ?? 0;
  const tacticalFit = input.tacticalFit ?? 50;
  const fatigueRisk = input.fatigueRisk ?? 40;
  const defensiveRisk = input.defensiveRisk ?? 40;

  const budgetDelta = 0;
  const wageDelta = 0;
  const squadDepthDelta = (benchQuality - 68) * 0.04;
  const tacticalFitDelta =
    (selectedXIQuality - 70) * 0.16 +
    (benchQuality - 68) * 0.09 +
    (tacticalFit - 50) * 0.18 -
    outOfPositionCount * 1.7;
  const boardConfidenceDelta =
    (selectedXIQuality - 70) * 0.06 +
    (benchQuality - 68) * 0.05 -
    outOfPositionCount * 0.95 -
    Math.max(0, fatigueRisk - 50) * 0.03;
  const fanConfidenceDelta =
    (selectedXIQuality - 70) * 0.06 +
    (tacticalFit - 50) * 0.09 -
    outOfPositionCount * 0.95 -
    Math.max(0, defensiveRisk - 50) * 0.03;
  const mediaPressureDelta = -0.1 + Math.max(0, fatigueRisk - 45) * 0.04 + Math.max(0, defensiveRisk - 45) * 0.05 + outOfPositionCount * 0.28;
  const youthPathwayDelta = Math.max(0, benchQuality - 68) * 0.05;
  const replacementRisk = clamp(Math.round(18 + outOfPositionCount * 14 + Math.max(0, 60 - benchQuality) * 0.35), 0, 100);

  addReasonSet(reasons, [
    `Formation ${input.formation} changes the tactical shape and should be judged on the XI, not just the label.`,
    outOfPositionCount > 0
      ? `${outOfPositionCount} player${outOfPositionCount === 1 ? "" : "s"} are out of position, which reduces tactical clarity.`
      : "The XI is mostly in position, so the shape is easier to trust.",
    benchQuality >= 72
      ? "The bench is strong enough to support the setup if the game turns."
      : "The bench is thin enough that the formation carries more downside if the match gets messy.",
  ]);
  if (fatigueRisk >= 60 || defensiveRisk >= 60) {
    pushReason(reasons, "High fatigue or defensive risk makes the setup more fragile.");
  }
  if (selectedXIQuality >= 78 && benchQuality >= 72 && outOfPositionCount === 0) {
    pushReason(reasons, "This is a clean tactical setup with enough quality to back it up.");
  }
  const riskText = riskReason(replacementRisk);
  if (riskText) pushReason(reasons, riskText);

  return buildPreview("formation", {
    budgetDelta,
    wageDelta,
    squadDepthDelta,
    boardConfidenceDelta,
    fanConfidenceDelta,
    mediaPressureDelta,
    tacticalFitDelta,
    youthPathwayDelta,
    replacementRisk,
    reasons,
    severityScore: boardConfidenceDelta + fanConfidenceDelta + tacticalFitDelta - mediaPressureDelta - replacementRisk * 0.04,
  });
}

export function applyDecisionImpact<
  T extends {
    board_confidence_score?: number | null;
    fan_confidence_score?: number | null;
    media_pressure_score?: number | null;
  },
>(target: T, impact: DecisionImpactPreview): T {
  return {
    ...target,
    board_confidence_score: clamp(Math.round((target.board_confidence_score ?? 0) + impact.boardConfidenceDelta), 0, 100),
    fan_confidence_score: clamp(Math.round((target.fan_confidence_score ?? 0) + impact.fanConfidenceDelta), 0, 100),
    media_pressure_score: clamp(Math.round((target.media_pressure_score ?? 0) + impact.mediaPressureDelta), 0, 100),
  };
}

function addReasonSet(reasons: string[], items: string[]): void {
  for (const item of items) pushReason(reasons, item);
}

function scenarioResult(label: string, impact: DecisionImpactPreview) {
  return {
    label,
    severity: impact.severity,
    impact,
  };
}

export const decisionImpactScenarios = [
  scenarioResult(
    "Selling a franchise/core player without replacement",
    previewSaleImpact({
      playerId: "core-1",
      playerName: "Core Star",
      playerImportance: "core",
      wageTier: "elite",
      boardSaleStance: "retain",
      transferFeeEurM: 35,
      replacementQuality: 48,
      squadDepthBefore: 64,
      tacticalImportance: 82,
      youthPathwayValue: 36,
    }),
  ),
  scenarioResult(
    "Selling a depth player with wage relief",
    previewSaleImpact({
      playerId: "depth-1",
      playerName: "Depth Player",
      playerImportance: "sellable",
      wageTier: "high",
      boardSaleStance: "open_to_sale",
      transferFeeEurM: 14,
      replacementQuality: 60,
      squadDepthBefore: 74,
      tacticalImportance: 40,
      youthPathwayValue: 58,
    }),
  ),
  scenarioResult(
    "Signing a needed player with good tactical fit",
    previewSigningImpact({
      playerId: "sign-1",
      playerName: "Needed Starter",
      feeEurM: 42,
      wageDemandTier: "high",
      targetImportance: "starter",
      tacticalFit: 78,
      squadNeed: 84,
      injuryRisk: 20,
      contractYears: 5,
      blocksYouthPathway: false,
      replacementQuality: 66,
      sellerResistance: 48,
    }),
  ),
  scenarioResult(
    "Signing an expensive luxury/non-starter",
    previewSigningImpact({
      playerId: "sign-2",
      playerName: "Luxury Option",
      feeEurM: 68,
      wageDemandTier: "superstar",
      targetImportance: "rotation",
      tacticalFit: 56,
      squadNeed: 44,
      injuryRisk: 34,
      contractYears: 3,
      blocksYouthPathway: true,
      replacementQuality: 55,
      sellerResistance: 72,
    }),
  ),
  scenarioResult(
    "Loaning a youth player with minutes promise",
    previewLoanImpact({
      playerId: "loan-1",
      playerName: "Youth Loan",
      playerImportance: "development",
      wageTier: "low",
      age: 19,
      pathwayValue: 78,
      wageCoveragePercent: 70,
      minutesPromise: true,
      squadDepthBefore: 76,
      tacticalImportance: 38,
    }),
  ),
  scenarioResult(
    "Loaning a needed rotation player",
    previewLoanImpact({
      playerId: "loan-2",
      playerName: "Needed Rotation",
      playerImportance: "rotation",
      wageTier: "mid",
      age: 25,
      pathwayValue: 38,
      wageCoveragePercent: 25,
      minutesPromise: false,
      squadDepthBefore: 61,
      tacticalImportance: 72,
    }),
  ),
] as const;
