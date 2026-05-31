import type { BoardSaleStance, PlayerImportance, WageTier } from "@/lib/types";
import { clamp, roundToNearest } from "@/lib/utils";

export type NegotiationAction = "accept" | "improve" | "walk_away";

export type NegotiationOffer = {
  openingFeeEurM: number;
  sellerCounterEurM: number;
  wageDemandTier: WageTier;
  boardStance: "approved" | "approved_after_negotiation" | "needs_sales" | "board_review" | "rejected";
  sellerResistance: number;
  reasons: string[];
};

export type SaleOfferTiers = {
  lowball: number;
  fair: number;
  premium: number;
  recommended: "lowball" | "fair" | "premium";
  reasons: string[];
};

export type NegotiationResolution = {
  status: "accepted" | "improved" | "walked_away" | "rejected";
  finalFeeEurM: number | null;
  message: string;
  reasons: string[];
};

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function pushReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function weightByImportance(importance?: PlayerImportance | null) {
  switch (importance) {
    case "core":
      return 1.55;
    case "starter":
      return 1.25;
    case "rotation":
      return 1;
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

function wageWeight(tier?: WageTier | null) {
  switch (tier) {
    case "superstar":
      return 1.32;
    case "elite":
      return 1.2;
    case "high":
      return 1.08;
    case "mid":
      return 0.96;
    case "low":
      return 0.88;
    default:
      return 1;
  }
}

function boardStanceFromPressure(pressure: number, need: number) {
  if (pressure >= 74) return "approved";
  if (pressure >= 61) return "approved_after_negotiation";
  if (pressure >= 45) return "board_review";
  if (pressure >= 36) return need >= 74 ? "needs_sales" : "board_review";
  return "rejected";
}

function describeWageTier(tier: WageTier) {
  switch (tier) {
    case "low":
      return "low";
    case "mid":
      return "mid-level";
    case "high":
      return "high";
    case "elite":
      return "elite";
    case "superstar":
      return "superstar";
  }
}

export function inferPlayerImportance(input: {
  playerImportance?: PlayerImportance | null;
  bayernCategory?: "first_team" | "loan_return" | "youth" | "other" | null;
  age?: number | null;
  transferValueMinEurM?: number | null;
  transferValueMaxEurM?: number | null;
  feeEurM?: number | null;
  need?: number | null;
  position?: string | null;
  rating?: number | null;
}): PlayerImportance {
  if (input.playerImportance) return input.playerImportance;

  const need = input.need ?? 50;
  const rating = input.rating ?? 70;
  const fee = input.transferValueMaxEurM ?? input.transferValueMinEurM ?? input.feeEurM ?? 0;
  const age = input.age ?? 25;
  const category = input.bayernCategory ?? null;
  const position = (input.position ?? "").toUpperCase();

  if (category === "youth") return "development";
  if (category === "loan_return" && age <= 23) return "development";
  if (need >= 82 || rating >= 88 || fee >= 110 || /GK/.test(position) && age >= 30) return "core";
  if (need >= 72 || rating >= 82 || fee >= 70) return "starter";
  if (need >= 60 || rating >= 76 || fee >= 35) return "rotation";
  if (age <= 21 || need < 50) return "development";
  if (fee < 18) return "sellable";
  return "emergency_depth";
}

function riskBandLabel(risk: number) {
  if (risk <= 20) return "low";
  if (risk <= 45) return "medium";
  if (risk <= 70) return "high";
  return "severe";
}

function addRiskReason(reasons: string[], replacementRisk: number) {
  const band = riskBandLabel(replacementRisk);
  if (band === "low") return;
  pushReason(reasons, `Replacement risk is ${band}, so a backup plan matters.`);
}

export function createTransferNegotiation(input: {
  playerId: string;
  playerName: string;
  feeMinEurM: number;
  feeMaxEurM: number;
  wageTier?: WageTier | null;
  playerImportance?: PlayerImportance | null;
  tacticalFit?: number;
  squadNeed?: number;
  sellerResistance?: number;
  contractYears?: number;
  injuryRisk?: number;
}): NegotiationOffer {
  const reasons: string[] = [];
  const spread = Math.max(0, input.feeMaxEurM - input.feeMinEurM);
  const need = clamp(input.squadNeed ?? 55, 0, 100);
  const fit = clamp(input.tacticalFit ?? 55, 0, 100);
  const importanceWeight = weightByImportance(input.playerImportance);
  const wageImpact = wageWeight(input.wageTier);
  const sellerResistance = clamp(input.sellerResistance ?? 45, 0, 100);
  const contractYears = input.contractYears ?? 3;
  const injuryRisk = clamp(input.injuryRisk ?? 25, 0, 100);

  const baseOpen = input.feeMinEurM + spread * 0.3;
  const openingFeeEurM = roundToNearest(clamp(baseOpen - importanceWeight * 0.8 + (sellerResistance > 60 ? -0.4 : 0.2), input.feeMinEurM, input.feeMaxEurM), 0.5);

  const sellerPressure =
    sellerResistance * 0.28 +
    importanceWeight * 18 +
    (contractYears <= 2 ? 7 : contractYears <= 3 ? 4 : 1) +
    (wageImpact > 1.12 ? 3 : 0) +
    Math.max(0, injuryRisk - 30) * 0.12;
  const sellerCounterEurM = roundToNearest(
    clamp(
      openingFeeEurM + spread * 0.42 + sellerPressure * 0.04,
      openingFeeEurM,
      input.feeMaxEurM * (sellerResistance >= 70 ? 1.08 : 1),
    ),
    0.5,
  );

  const estimatedFinalFee = roundToNearest(clamp((openingFeeEurM + sellerCounterEurM * 1.03) / 2, input.feeMinEurM, input.feeMaxEurM * 1.08), 0.5);
  const finalPressure =
    84 -
    Math.max(0, estimatedFinalFee - input.feeMinEurM) * 0.72 -
    Math.max(0, wageImpact - 1) * 10 +
    Math.max(0, fit - 60) * 0.34 +
    Math.max(0, need - 60) * 0.3 -
    Math.max(0, injuryRisk - 35) * 0.1 -
    Math.max(0, sellerResistance - 50) * 0.12;
  const boardStance = boardStanceFromPressure(finalPressure, need);

  pushReason(reasons, `${input.playerName} starts around EUR ${round(openingFeeEurM)}m, which leaves room to negotiate.`);
  pushReason(reasons, `The seller is likely to counter near EUR ${round(sellerCounterEurM)}m because the market still values the player.`);
  if (need >= 70) {
    pushReason(reasons, "The squad need is real enough to justify a serious offer.");
  } else {
    pushReason(reasons, "This looks more like a squad-planning move than a must-have signing.");
  }
  if (fit >= 70) {
    pushReason(reasons, "The tactical fit is strong enough to keep the board interested.");
  }
  if (wageImpact > 1.1) {
    pushReason(reasons, `Wage demand sits in the ${describeWageTier(input.wageTier ?? "mid")} tier, so the structure needs discipline.`);
  }
  if (sellerResistance >= 60) {
    pushReason(reasons, "Seller resistance is high enough that Bayern need a clean fee structure.");
  }
  addRiskReason(
    reasons,
    clamp(
      Math.round(
        Math.max(10, Math.min(100, sellerResistance * 0.6 + (input.playerImportance === "core" ? 24 : input.playerImportance === "starter" ? 16 : 8))),
      ),
      0,
      100,
    ),
  );

  if (boardStance === "approved") {
    pushReason(reasons, "The board can live with this fee if the wage ladder stays controlled.");
  } else if (boardStance === "approved_after_negotiation") {
    pushReason(reasons, "A cleaner fee or wage tweak should get the deal over the line.");
  } else if (boardStance === "needs_sales") {
    pushReason(reasons, "Bayern probably need sales first before the board signs off.");
  } else if (boardStance === "board_review") {
    pushReason(reasons, "The deal needs a proper board discussion before anyone commits.");
  } else {
    pushReason(reasons, "The current price and wage shape make this look too expensive for Bayern right now.");
  }

  return {
    openingFeeEurM,
    sellerCounterEurM,
    wageDemandTier: input.wageTier ?? "mid",
    boardStance,
    sellerResistance: clamp(Math.round(finalPressure < 50 ? 75 : sellerResistance * 0.9 + 10), 0, 100),
    reasons: reasons.slice(0, 5),
  };
}

export function resolveNegotiationAction(input: {
  action: NegotiationAction;
  offer: NegotiationOffer;
  improvedFeeEurM?: number;
}): NegotiationResolution {
  if (input.action === "walk_away") {
    return {
      status: "walked_away",
      finalFeeEurM: null,
      message: "Bayern walked away from the talks.",
      reasons: [...input.offer.reasons],
    };
  }

  const chosenFee = roundToNearest(
    clamp(
      input.improvedFeeEurM ?? (input.action === "improve" ? (input.offer.openingFeeEurM + input.offer.sellerCounterEurM) / 2 : input.offer.sellerCounterEurM),
      input.offer.openingFeeEurM,
      input.offer.sellerCounterEurM * 1.12,
    ),
    0.5,
  );

  if (input.action === "improve") {
    const improved = chosenFee >= input.offer.sellerCounterEurM * 0.94;
    return {
      status: improved ? "improved" : "rejected",
      finalFeeEurM: chosenFee,
      message: improved ? "Bayern improved the bid and kept the seller talking." : "The improved bid still sits below the seller's patience line.",
      reasons: [...input.offer.reasons, improved ? "The improved fee is close enough to keep talks alive." : "The seller still wants a cleaner package."].slice(0, 5),
    };
  }

  if (input.offer.boardStance === "rejected" || input.offer.boardStance === "needs_sales") {
    const message =
      input.offer.boardStance === "needs_sales"
        ? "Needs more budget: the board wants sales before this transfer can be accepted."
        : "Rejected by board: the transfer package is too hard to justify.";
    return {
      status: "rejected",
      finalFeeEurM: chosenFee,
      message,
      reasons: [...input.offer.reasons, "The board stance blocks a normal acceptance."].slice(0, 5),
    };
  }

  const accepted =
    chosenFee >= input.offer.sellerCounterEurM * 0.96 ||
    input.offer.boardStance === "approved" ||
    input.offer.boardStance === "board_review";

  return {
    status: accepted ? "accepted" : "rejected",
    finalFeeEurM: chosenFee,
    message: accepted
      ? input.offer.boardStance === "approved"
        ? "The deal is accepted and can be committed."
        : input.offer.boardStance === "board_review"
          ? "The package goes to final board approval with clear risk attached."
        : "The deal is accepted after negotiation."
      : "The deal is rejected because the board stance is still too weak.",
    reasons: [
      ...input.offer.reasons,
      accepted
        ? input.offer.boardStance === "board_review"
          ? "This is not a free green light, but it is realistic enough for the final approval check."
          : "The final fee is within the negotiated range."
        : "The final fee is still too far from the seller's terms.",
    ].slice(0, 5),
  };
}

export function createSaleOffers(input: {
  playerId: string;
  playerName: string;
  transferValueMinEurM?: number | null;
  transferValueMaxEurM?: number | null;
  playerImportance?: PlayerImportance | null;
  wageTier?: WageTier | null;
  boardSaleStance?: BoardSaleStance | null;
  age?: number | null;
  contractYearsLeft?: number | null;
}): SaleOfferTiers {
  const reasons: string[] = [];
  const minValue = input.transferValueMinEurM ?? 0;
  const maxValue = input.transferValueMaxEurM ?? minValue;
  const midpoint = (minValue + maxValue) / 2 || maxValue || minValue || 10;
  const importanceWeight = weightByImportance(input.playerImportance);
  const wageImpact = wageWeight(input.wageTier);
  const age = input.age ?? 26;
  const stance = input.boardSaleStance ?? "open_to_sale";
  const contractYearsLeft = input.contractYearsLeft ?? 3;

  const lowball = roundToNearest(clamp(midpoint * (0.8 - importanceWeight * 0.03), Math.max(1, minValue * 0.7), Math.max(minValue, maxValue)), 0.5);
  const fair = roundToNearest(clamp(midpoint * (0.95 + (age >= 29 ? 0.02 : 0)), lowball, Math.max(maxValue, midpoint * 1.05)), 0.5);
  const premiumBase = midpoint * (1.12 + importanceWeight * 0.08 + (wageImpact > 1.1 ? 0.03 : 0));
  const premium = roundToNearest(clamp(premiumBase, fair, Math.max(maxValue * 1.3, midpoint * 1.3)), 0.5);

  let recommended: SaleOfferTiers["recommended"] = "fair";
  if (input.playerImportance === "core" || input.playerImportance === "starter" || stance === "block") {
    recommended = "premium";
  } else if (age >= 30 && wageImpact >= 1.05) {
    recommended = "fair";
  } else if (input.playerImportance === "sellable" || input.playerImportance === "emergency_depth") {
    recommended = wageImpact > 1.05 ? "fair" : "lowball";
  } else if (input.playerImportance === "rotation") {
    recommended = contractYearsLeft <= 2 ? "fair" : "premium";
  }

  pushReason(reasons, `${input.playerName} is valued around EUR ${round(midpoint)}m, with a range from EUR ${round(lowball)}m to EUR ${round(premium)}m.`);
  if (input.playerImportance === "core" || input.playerImportance === "starter") {
    pushReason(reasons, "Core or starter players should not be moved on a cheap offer.");
  } else if (input.playerImportance === "sellable" || input.playerImportance === "emergency_depth") {
    pushReason(reasons, "Depth or sellable players can move on a fair package if the wage relief is useful.");
  } else if (input.playerImportance === "rotation") {
    pushReason(reasons, "Rotation players sit between squad value and squad need, so the middle offer is usually best.");
  } else if (input.playerImportance === "development") {
    pushReason(reasons, "Development players can be sold cheaply only if the pathway is already blocked.");
  }
  if (age >= 29) {
    pushReason(reasons, "Age and resale curve give Bayern more room to accept a fair or slightly lower offer.");
  }
  if (wageImpact > 1.1) {
    pushReason(reasons, "High wages make the sale easier to justify to the board.");
  }
  if (stance === "block") {
    pushReason(reasons, "A board-blocked sale needs a premium if Bayern are going to move.");
  }

  return {
    lowball,
    fair,
    premium,
    recommended,
    reasons: reasons.slice(0, 5),
  };
}
