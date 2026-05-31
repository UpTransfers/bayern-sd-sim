import type { SimulationSummary } from "../types";
import { clamp } from "../utils";
import type { TransferCandidate } from "../data/bayern2026";
import { classifyWageConcern, lookupTransferMarketIntel } from "../data/transferMarketIntel";
import { positionBucket } from "./normalize";

export type BayernTransferApproval = {
  sportingNeed: number;
  playerQuality: number;
  financialRealism: number;
  supervisoryBoardAcceptance: number;
  marketFeasibility: number;
  bayernIdentity: number;
  total: number;
  decision: "Approved" | "Approved after negotiation" | "Board review / delayed / depends on sales" | "Likely rejected" | "Unrealistic";
  hardBlock: boolean;
  stage: "greenlight" | "negotiation" | "board_review" | "blocked";
  vetoReasons: string[];
  wagePressureNote: string;
  positionContext: string;
  conversationSummary: string;
  negotiationPath: string;
  openingOffer: string;
  counterOffer: string;
  wageCeiling: string;
  sellerStance: string;
};

type PositionBucket = "GK" | "DEF" | "MID" | "ATT";

function positionLabel(position: string) {
  const pos = position.toUpperCase();
  if (pos.includes("GK")) return "goalkeeper";
  if (pos.includes("CB")) return "centre-back";
  if (pos.includes("LB") || pos.includes("RB") || pos.includes("WB")) return "full-back";
  if (pos.includes("DM")) return "holding midfielder";
  if (pos.includes("CM")) return "midfielder";
  if (pos.includes("AM")) return "creator";
  if (pos.includes("LW") || pos.includes("RW")) return "winger";
  if (pos.includes("ST")) return "striker";
  return "player";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function squadBucketCounts(summary: SimulationSummary) {
  const counts: Record<PositionBucket, number> = {
    GK: 0,
    DEF: 0,
    MID: 0,
    ATT: 0,
  };

  for (const entry of summary.activeRoster) {
    const candidatePosition = entry.kind === "catalog" ? entry.player.position : entry.player.position;
    const bucket = positionBucket(candidatePosition) as PositionBucket;
    counts[bucket] += 1;
  }

  return counts;
}

function starterNeed(summary: SimulationSummary, position: string) {
  const bucket = positionBucket(position) as PositionBucket;
  const counts = squadBucketCounts(summary);

  const shortages: Record<PositionBucket, number> = {
    GK: counts.GK < 3 ? 1 : 0,
    DEF: counts.DEF < 7 ? 1 : 0,
    MID: counts.MID < 8 ? 1 : 0,
    ATT: counts.ATT < 6 ? 1 : 0,
  };

  return shortages[bucket] ? 1 : 0.55;
}

function realismBand(value: string) {
  switch (value.toLowerCase()) {
    case "realistic":
      return 1;
    case "medium realistic":
      return 0.9;
    case "difficult":
      return 0.7;
    case "dream":
      return 0.4;
    case "not recommended":
      return 0.3;
    default:
      return 0.6;
  }
}

function sellingClubResistance(candidate: TransferCandidate) {
  const premiumClubs = [
    "brighton",
    "psg",
    "liverpool",
    "real madrid",
    "manchester city",
    "chelsea",
    "juventus",
    "tottenham hotspur",
    "bournemouth",
    "atletico",
    "arsenal",
    "barcelona",
    "benfica",
    "porto",
    "rb leipzig",
    "inter",
    "milan",
    "crystal palace",
    "nottingham forest",
  ];
  const normalizedClub = normalizeText(candidate.club);
  return premiumClubs.some((club) => normalizedClub.includes(club)) ? 1.2 : 1;
}

function parseWageLabelToMillions(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/\*\*/g, "").replace(/,/g, "").trim();
  const euroYear = cleaned.match(/€\s*([\d.]+)\s*m\/y/i);
  if (euroYear) return Number(euroYear[1]);
  const poundYear = cleaned.match(/£\s*([\d.]+)\s*m\/y/i);
  if (poundYear) return Number(poundYear[1]) * 1.17;
  const euroWeek = cleaned.match(/€\s*([\d.]+)\s*k\s*p\/w/i);
  if (euroWeek) return Number(euroWeek[1]) * 0.052;
  const poundWeek = cleaned.match(/£\s*([\d.]+)\s*k\s*p\/w/i);
  if (poundWeek) return Number(poundWeek[1]) * 0.052 * 1.17;
  const estimate = cleaned.match(/(?:est\.|~)?\s*€?\s*([\d.]+)(?:-([\d.]+))?\s*m\/y/i);
  if (estimate) return Number(estimate[2] ?? estimate[1]);
  return null;
}

function wagePressure(candidate: TransferCandidate, intel?: ReturnType<typeof lookupTransferMarketIntel>) {
  const agePressure = candidate.ageMin >= 30 ? 1.25 : candidate.ageMin >= 27 ? 1.12 : candidate.ageMin <= 22 ? 0.92 : 1;
  const marketPressure = candidate.fee.max >= 100 ? 1.35 : candidate.fee.max >= 80 ? 1.2 : candidate.fee.max >= 60 ? 1.08 : 1;
  const starPressure = candidate.ability >= 8.6 ? 1.15 : candidate.ability >= 8.2 ? 1.08 : 1;
  const wageConcern = candidate.wageConcern ?? classifyWageConcern(intel);
  const concernMultiplier = wageConcern === "Very High" ? 1.28 : wageConcern === "High" ? 1.16 : wageConcern === "Medium" ? 1.05 : 0.95;
  const currentWage = parseWageLabelToMillions(intel?.currentWage ?? candidate.currentWage ?? null);
  const demandWage = parseWageLabelToMillions(intel?.bayernDemand ?? candidate.bayernDemand ?? null);
  const demandPressure = currentWage && demandWage ? clamp(demandWage / Math.max(currentWage, 0.1), 0.95, 1.55) : 1;
  return agePressure * marketPressure * starPressure * concernMultiplier * demandPressure;
}

export function evaluateBayernTransferApproval(candidate: TransferCandidate, summary: SimulationSummary): BayernTransferApproval {
  const vetoReasons: string[] = [];
  const intel = lookupTransferMarketIntel(candidate.name);
  const feeHigh = candidate.fee.max > 80;
  const guaranteedStarter = candidate.ability >= 8.5 && candidate.bayernFit >= 8.4;
  const contractStability = /20(2[7-9]|3[0-5])|^free/i.test(candidate.contract);
  const oldAndExpensive = candidate.ageMin >= 29 && candidate.fee.max >= 40 && !contractStability;
  const positionNeed = starterNeed(summary, candidate.position);
  const sameRoleCount = summary.activeRoster.filter((entry) => {
    const position = entry.kind === "catalog" ? entry.player.position : entry.player.position;
    return positionBucket(position) === positionBucket(candidate.position);
  }).length;
  const roleCounts = squadBucketCounts(summary);
  const roleBucket = positionBucket(candidate.position) as PositionBucket;
  const rolePressure = roleCounts[roleBucket];
  const pathwayBlock = (candidate.position.includes("GK") && rolePressure >= 3) || (sameRoleCount >= 5 && candidate.ageMin >= 24);
  const sellingClubHard = sellingClubResistance(candidate) > 1.1;
  const wageMultiplier = wagePressure(candidate, intel);
  const remainingBudget = Math.max(summary.simulation.remaining_budget_eur, 1);
  const budgetShare = candidate.fee.max / remainingBudget;
  const currentSpendPressure = summary.signings.reduce((sum, signing) => sum + signing.fee_eur, 0) / Math.max(summary.simulation.selected_budget_eur, 1);
  const needScore = candidate.need ?? Math.round(positionNeed * 100);
  const strongNeed = needScore >= 75;
  const strongFit = candidate.bayernFit >= 8.1;
  const bundesligaFamiliarity =
    /(bayern|borussia dortmund|rb leipzig|vfb stuttgart|hoffenheim|mainz|freiburg|frankfurt|wolfsburg|augsburg|union|koln|bremen|hamburg|leverkusen|schalke|mgladbach)/i.test(
      normalizeText(candidate.club),
    ) ||
    /ger/i.test(normalizeText(candidate.nationality)) ||
    /former bayern|bayern/i.test(normalizeText(candidate.characterNote));
  const positionPriority = roleBucket === "GK" ? 1.05 : roleBucket === "DEF" ? 1.0 : roleBucket === "MID" ? 0.95 : 0.9;

  if (feeHigh && !guaranteedStarter && !(strongNeed && strongFit)) {
    vetoReasons.push("Fee above EUR 80m without guaranteed-starter status.");
  }
  if (oldAndExpensive) {
    vetoReasons.push("Age 29+ with a high fee and long contract.");
  }
  if (pathwayBlock) {
    vetoReasons.push("Could block an internal or academy pathway without a clear upgrade.");
  }
  if (sellingClubHard && candidate.fee.max >= 45) {
    vetoReasons.push("Selling club would likely demand a premium and resist negotiation.");
  }
  if (budgetShare >= 0.55 && candidate.realism !== "Realistic" && !(strongNeed && strongFit)) {
    vetoReasons.push("The fee would eat too much of the current budget for a non-core target.");
  }
  if (wageMultiplier >= 1.45 || (wageMultiplier >= 1.32 && candidate.realism !== "Realistic" && !strongNeed)) {
    vetoReasons.push("The wage request would distort Bayern's top-earner structure.");
  }
  if (currentSpendPressure > 0.65 && feeHigh) {
    vetoReasons.push("Bayern have already committed too much budget to add another premium fee.");
  }

  const sportingNeed = Math.round(
    clamp(
      25 * Math.max(positionNeed, candidate.need ? candidate.need / 100 : positionNeed) * positionPriority +
        (candidate.bayernFit >= 8.7 ? 3.5 : candidate.bayernFit >= 8 ? 2.2 : 0.5) +
        (roleBucket === "GK" && rolePressure < 3 ? 1.2 : 0) +
        (roleBucket === "ATT" && sameRoleCount < 4 ? 0.8 : 0),
      0,
      25,
    ),
  );

  const playerQuality = Math.round(clamp((candidate.ability / 10) * 20, 0, 20));

  const feePressure = candidate.fee.max >= 100 ? 11 : candidate.fee.max >= 80 ? 9 : candidate.fee.max >= 60 ? 6 : candidate.fee.max >= 40 ? 3 : 1;
  const contractPressure = /uncertain/i.test(candidate.contract) ? 3 : /2027|2028/i.test(candidate.contract) ? 1 : 2;
  const agePressure = candidate.ageMin >= 30 ? 5 : candidate.ageMin >= 28 ? 3 : candidate.ageMin >= 25 ? 2 : 1;
  const resaleValue = candidate.ageMin <= 22 ? 5 : candidate.ageMin <= 25 ? 4 : candidate.ageMin <= 28 ? 2 : 1;
  const financialRealism = Math.round(
    clamp(
      25 - feePressure - contractPressure - agePressure + resaleValue - Math.round((wageMultiplier - 1) * 6) - Math.round(budgetShare * 6),
      0,
      25,
    ),
  );

  const boardBase =
    15 -
    (feeHigh ? 4 : 0) -
    (candidate.realism === "Dream" ? 4 : candidate.realism === "Difficult" ? 2 : 0) -
    (wageMultiplier > 1.25 ? 3 : wageMultiplier > 1.1 ? 1 : 0) -
    (budgetShare >= 0.4 ? 2 : 0);
  const supervisoryBoardAcceptance = Math.round(
    clamp(
      boardBase +
        (candidate.bayernFit >= 8.5 ? 2 : strongFit ? 1 : 0) +
        (strongNeed ? 2 : 0) +
        (bundesligaFamiliarity ? 1 : 0) -
        (pathwayBlock ? 2 : 0) -
        (roleBucket === "ATT" && feeHigh && !strongNeed ? 1 : 0),
      0,
      15,
    ),
  );

  const marketFeasibility = Math.round(
    clamp(
      realismBand(candidate.realism) * 10 - (candidate.fee.max > 65 ? 2 : 0) - (candidate.fee.max > 90 ? 2 : 0) - (sellingClubHard ? 1 : 0) + (/uncertain/i.test(candidate.contract) ? 0 : 1) + (bundesligaFamiliarity ? 1 : 0),
      0,
      10,
    ),
  );

  const bayernIdentity = Math.round(clamp((candidate.bayernFit / 10) * 5 + (candidate.position.includes("DM") ? 0.4 : 0) + (bundesligaFamiliarity ? 0.5 : 0), 0, 5));

  const total = sportingNeed + playerQuality + financialRealism + supervisoryBoardAcceptance + marketFeasibility + bayernIdentity;

  const wagePressureNote =
    intel
      ? `${intel.currentWage} at the current club against a Bayern demand of ${intel.bayernDemand}. ${
          wageMultiplier >= 1.35
            ? "This would likely push the player into Bayern's top-earner bracket."
            : wageMultiplier >= 1.15
            ? "Wage pressure is significant and would need careful negotiation."
            : "Wage pressure is manageable if Bayern keep the role tight."
        }`
      : wageMultiplier >= 1.35
      ? "Wage request would likely place the player among Bayern's top earners."
      : wageMultiplier >= 1.15
      ? "Wage pressure is significant and would need careful negotiation."
      : "Wage pressure appears manageable relative to role and fee.";

  const openingOffer = `Opening fee around EUR ${Math.round(candidate.fee.min * 0.92)}m`;
  const counterOffer = `Seller counter likely near EUR ${Math.round(candidate.fee.max * 1.05)}m`;
  const wageCeiling =
    candidate.ability >= 8.7
      ? "Only a true starter wage is credible."
      : candidate.ability >= 8.2
      ? "Strong starter money, but not a record deal."
      : "A disciplined squad salary should be enough.";
  const sellerStance = sellingClubHard
    ? "Seller is likely to hold firm unless Bayern overpay."
    : candidate.realism === "Dream"
    ? "Seller resistance is expected to be very high."
    : "Seller stance looks negotiable with a realistic structure.";

  const positionContext =
    roleBucket === "GK"
      ? `Bayern treat ${positionLabel(candidate.position)} deals as succession decisions, not just depth buys.`
      : roleBucket === "DEF"
      ? `The board will back ${positionLabel(candidate.position)} targets only if they clearly improve the high line or build-up.`
      : roleBucket === "MID"
      ? `Midfield signings are judged against Bayern's current hierarchy, press resistance, and pathway for internal players.`
      : `Forward targets are expected to create a decisive upgrade, not just add names to the attacking pool.`;

  let decision: BayernTransferApproval["decision"] = "Approved";
  if (total >= 80) decision = "Approved";
  else if (total >= 66) decision = "Approved after negotiation";
  else if (total >= 52) decision = "Board review / delayed / depends on sales";
  else if (total >= 36) decision = "Likely rejected";
  else decision = "Unrealistic";

  const hardBlock =
    total < 36 ||
    (feeHigh && !guaranteedStarter && !strongNeed && total < 58) ||
    (oldAndExpensive && total < 66) ||
    (pathwayBlock && !strongNeed && total < 52) ||
    (wageMultiplier >= 1.48 && total < 64);

  if (hardBlock) {
    decision = total < 36 ? "Unrealistic" : "Likely rejected";
  } else if (vetoReasons.length) {
    const severeVeto = vetoReasons.some((reason) => /top-earner|already committed|Age 29\+/.test(reason));
    if (decision === "Approved" && severeVeto) {
      decision = total >= 72 ? "Approved after negotiation" : "Board review / delayed / depends on sales";
    }
    if (total < 52) decision = "Likely rejected";
  }

  const stage: BayernTransferApproval["stage"] =
    decision === "Approved"
      ? "greenlight"
      : decision === "Approved after negotiation"
      ? "negotiation"
      : decision === "Board review / delayed / depends on sales"
      ? "board_review"
      : "blocked";

  const conversationSummary =
    decision === "Approved"
      ? `Sporting department, finance, and the board are aligned on the ${positionLabel(candidate.position)} target.`
      : decision === "Approved after negotiation"
      ? "The room likes the profile, but Bayern will push for a cleaner fee, better wages, or a slightly shorter commitment."
      : decision === "Board review / delayed / depends on sales"
      ? "The fit is there, but the board wants a real conversation about sales, wages, and who the deal blocks."
      : decision === "Likely rejected"
      ? "The target is plausible in football terms, but Bayern's financial and squad logic needs a major reset first."
      : "This does not fit Bayern's financial caution or squad structure right now.";

  const negotiationPath =
    decision === "Approved"
      ? "Can be signed now, but Bayern should still protect the wage structure."
      : decision === "Approved after negotiation"
      ? "Proceed if the fee or wages move in Bayern's favour. Push one lever, not both."
      : decision === "Board review / delayed / depends on sales"
      ? "Needs a sale, wage compression, or a softer seller stance before Bayern commit."
      : decision === "Likely rejected"
      ? "Only a major change in price, role, or pathway would reopen it."
      : "No realistic path without a different player or market context.";

  return {
    sportingNeed,
    playerQuality,
    financialRealism,
    supervisoryBoardAcceptance,
    marketFeasibility,
    bayernIdentity,
    total,
    decision,
    hardBlock,
    stage,
    vetoReasons,
    wagePressureNote,
    positionContext,
    conversationSummary,
    negotiationPath,
    openingOffer,
    counterOffer,
    wageCeiling,
    sellerStance,
  };
}
