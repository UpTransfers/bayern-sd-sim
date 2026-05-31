import type { SimulationSummary } from "../types";
import { average, clamp } from "../utils";
import { ageBand, positionBucket } from "./normalize";
import { pokalModel, uclTitleModel } from "../data/bayern2026";
import { normalizeTactics, tacticalImpact } from "../simulation/tactics";
import { formationSlots, type FormationKey } from "../simulation/formations";
import { analyzeBayernLineup, slotFitScore } from "./lineupImpact";
import { deriveRosterEntryProfile } from "./playerModel";

function currentTactics(summary: SimulationSummary) {
  return normalizeTactics(summary.simulation.tactics_json ?? null);
}

export function squadBalanceScore(summary: SimulationSummary) {
  const entries = summary.activeRoster;
  const profiles = entries.map((entry) => ({
    entry,
    profile: deriveRosterEntryProfile(entry),
  }));
  const players = profiles.map((item) => item.entry.player);

  const gk = players.filter((player) => positionBucket(player.position) === "GK").length;
  const def = players.filter((player) => positionBucket(player.position) === "DEF").length;
  const mid = players.filter((player) => positionBucket(player.position) === "MID").length;
  const att = players.filter((player) => positionBucket(player.position) === "ATT").length;
  const ageScores = players.map((player) => {
    const age = player.age ?? 26;
    if (age <= 21) return 62;
    if (age <= 24) return 75;
    if (age <= 28) return 84;
    if (age <= 31) return 70;
    return 55;
  });
  const valueScores = entries.map((entry) => {
    const profile = deriveRosterEntryProfile(entry);
    const player = entry.player;
    const catalogPlayer =
      entry.kind === "catalog"
        ? (player as {
            transfer_value_min_eur_m?: number | null;
            transfer_value_max_eur_m?: number | null;
          })
        : null;
    const signingPlayer =
      entry.kind === "catalog"
        ? null
        : (player as {
            fee?: number | null;
          });
    const min =
      entry.kind === "catalog"
        ? catalogPlayer?.transfer_value_min_eur_m ?? 0
        : typeof signingPlayer?.fee === "number"
          ? Math.max(6, signingPlayer.fee * 0.06)
          : 0;
    const max =
      entry.kind === "catalog"
        ? catalogPlayer?.transfer_value_max_eur_m ?? min
        : typeof signingPlayer?.fee === "number"
          ? Math.max(min, signingPlayer.fee * 0.12)
          : min;
    const midpoint = (min + max) / 2;
    return clamp(36 + midpoint * 0.48 + profile.rating * 0.18, 0, 100);
  });

  const eliteSigningBoost = Math.min(
    14,
    summary.signings.reduce((sum, signing) => {
      const fitBoost = signing.tactical_fit_score >= 88 ? 4.5 : signing.tactical_fit_score >= 80 ? 3 : signing.tactical_fit_score >= 72 ? 1.5 : 0;
      const needBoost = signing.squad_need_score >= 85 ? 2.5 : signing.squad_need_score >= 72 ? 1.4 : 0;
      return sum + fitBoost + needBoost;
    }, 0),
  );

  const balance =
    32 +
    Math.min(gk, 3) * 10 +
    Math.min(def, 9) * 3 +
    Math.min(mid, 8) * 3 +
    Math.min(att, 6) * 4 +
    average(ageScores) * 0.18 +
    average(valueScores) * 0.16 +
    eliteSigningBoost;

  const shortagePenalty =
    (gk === 0 ? 35 : 0) +
    (def < 4 ? 18 : 0) +
    (mid < 4 ? 14 : 0) +
    (att < 3 ? 14 : 0);

  return clamp(Math.round(balance - shortagePenalty), 0, 100);
}

export function tacticalFitScore(summary: SimulationSummary) {
  const tactics = tacticalImpact(currentTactics(summary));
  const lineup = analyzeBayernLineup(summary, currentTactics(summary));
  const formationBonus = computeFormationFit(summary);

  const signedFitBoost = Math.min(
    10,
    summary.signings.reduce((sum, signing) => sum + Math.max(0, signing.tactical_fit_score - 70) * 0.08, 0),
  );
  const lineupSynergy = summary.lineup?.lineup_json
    ? 5 + Math.min(8, lineup.chemistry * 0.08) + Math.min(4, lineup.control * 0.03)
    : 0;
  const mismatchPenalty = Math.min(16, lineup.outOfPositionCount * 2.75 + Math.max(0, 72 - lineup.startingQuality) * 0.06);
  const positionFitScore = summary.lineup?.position_fit_score ?? 0;
  const tacticalScore = summary.lineup?.tactical_score ?? 0;

  return clamp(
    Math.round(
      lineup.startingQuality * 0.38 +
        lineup.control * 0.2 +
        lineup.threat * 0.12 +
        positionFitScore * 0.18 +
        tacticalScore * 0.22 +
        formationBonus +
        signedFitBoost +
        lineupSynergy -
        mismatchPenalty +
        tactics.control * 0.12 +
        tactics.threat * 0.08 -
        tactics.risk * 0.07 -
        tactics.fatigue * 0.04 +
        tactics.chemistry * 0.05,
    ),
    0,
    100,
  );
}

function computeFormationFit(summary: SimulationSummary) {
  const formation = (summary.lineup?.formation as FormationKey | undefined) ?? "4-2-3-1";
  const lineup = (summary.lineup?.lineup_json as Array<{ slot: string; playerId: string }> | undefined) ?? [];
  if (!lineup.length) return 5;
  const slots = new Set(formationSlots(formation));
  const rosterMap = new Map(summary.activeRoster.map((entry) => [entry.id, entry]));
  const naturalCount = lineup.filter((item) => {
    if (!slots.has(item.slot)) return false;
    const entry = rosterMap.get(item.playerId);
    return entry ? slotFitScore(item.slot, entry.player.position) >= 88 : false;
  }).length;
  return clamp(Math.round(4 + (naturalCount / 11) * 12), 4, 16);
}

export function budgetEfficiencyScore(summary: SimulationSummary) {
  const spend = summary.simulation.selected_budget_eur - summary.simulation.remaining_budget_eur;
  if (summary.simulation.selected_budget_eur <= 0) return 55;
  const spendRatio = spend / summary.simulation.selected_budget_eur;
  const valueScore = clamp(100 - Math.abs(spendRatio - 0.55) * 120, 0, 100);
  const savingsBonus = clamp((summary.simulation.remaining_budget_eur / summary.simulation.selected_budget_eur) * 22, 0, 22);
  return clamp(Math.round(valueScore + savingsBonus), 0, 100);
}

export function riskRating(summary: SimulationSummary) {
  const tactics = tacticalImpact(currentTactics(summary));
  const lineup = analyzeBayernLineup(summary, currentTactics(summary));
  const rosterSize = summary.activeRoster.length;
  const depthRisk = rosterSize < 18 ? 92 : rosterSize < 21 ? 72 : rosterSize > 30 ? 60 : 28;
  const loanRisk = summary.loanedPlayerIds.length * 3;
  const saleRisk = summary.soldPlayerIds.length * 4;
  const cupLoad = Math.round((pokalModel.bayern.extra_time_probability * 60) + (uclTitleModel[0].volatility / 4));
  const mismatchPenalty = lineup.outOfPositionCount * 5 + Math.max(0, 72 - lineup.depth) * 0.08;
  return clamp(Math.round(depthRisk + loanRisk + saleRisk + cupLoad * 0.15 + mismatchPenalty + tactics.risk * 0.35 + tactics.fatigue * 0.25 - tactics.control * 0.08), 0, 100);
}

export function mediaPressureScore(summary: SimulationSummary) {
  const board = summary.simulation.board_confidence;
  const fan = summary.simulation.fan_confidence;
  return clamp(Math.round(100 - (board * 0.42 + fan * 0.38)), 0, 100);
}

export function injuryVulnerabilityScore(summary: SimulationSummary) {
  const tactics = tacticalImpact(currentTactics(summary));
  const lineup = analyzeBayernLineup(summary, currentTactics(summary));
  const rosterSize = summary.activeRoster.length;
  const agePenaltyValues = summary.activeRoster
    .map((entry) => (entry.kind === "catalog" ? entry.player.age ?? 26 : 26))
    .filter(Boolean)
    .map((age) => (age > 31 ? 10 : age > 28 ? 6 : age < 22 ? 5 : 2))
    ;
  const agePenalty = Math.round((agePenaltyValues.reduce((sum, value) => sum + value, 0) / Math.max(1, agePenaltyValues.length)) * 1.6);
  const depthPenalty = rosterSize < 20 ? 22 : rosterSize < 24 ? 12 : 6;
  const competitionLoad = Math.round((pokalModel.bayern.volatility_rating + uclTitleModel[0].volatility) / 8);
  const mismatchPenalty = lineup.outOfPositionCount * 2.4 + Math.max(0, 72 - lineup.benchQuality) * 0.05;
  return clamp(
    Math.round(
      22 +
        agePenalty +
        depthPenalty +
        competitionLoad +
        mismatchPenalty +
        tactics.fatigue * 0.14 +
        tactics.risk * 0.08 -
        Math.min(summary.simulation.remaining_budget_eur / 12, 10),
    ),
    0,
    100,
  );
}

export function squadAgeProfile(summary: SimulationSummary) {
  const ages = summary.activeRoster
    .map((entry) => (entry.kind === "catalog" ? entry.player.age : entry.player.age))
    .filter((age): age is number => typeof age === "number");
  if (!ages.length) return { averageAge: null, ageBands: [] as Array<[string, number]> };
  const averageAge = Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length);
  const bands = ["U22", "22-24", "25-28", "29-31", "32+"];
  const ageBands = bands.map((band) => [band, ages.filter((age) => ageBand(age) === band).length] as [string, number]);
  return { averageAge, ageBands };
}
