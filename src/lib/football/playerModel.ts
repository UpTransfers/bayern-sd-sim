import type { PlayerRecord, SimulationRosterEntry } from "../types";
import type { TransferCandidate } from "../data/bayern2026";
import { clamp, stableId } from "../utils";
import { ageBand, positionBucket } from "./normalize";

export type PlayerMetricProfile = {
  rating: number;
  form: number;
  ceiling: number;
  floor: number;
  pressure: number;
  role: "GK" | "DEF" | "MID" | "ATT" | "UNK";
  summary: string;
};

type SeasonSignal = {
  apps?: number;
  starts?: number;
  minutes?: number;
  goals?: number;
  assists?: number;
  note?: string;
};

export function deriveCatalogPlayerProfile(player: PlayerRecord): PlayerMetricProfile {
  const role = roleFromPosition(player.position);
  const confidence = player.data_confidence / 100;
  const fit = (player.bayern_fit_score ?? player.data_confidence * 0.72) / 100;
  const valueSignal = valueSignalFromRange(player.transfer_value_min_eur_m, player.transfer_value_max_eur_m);
  const traitBonus = Array.isArray(player.traits) ? Math.min(4, player.traits.length * 0.8) : 0;
  const note = [player.personality_note, player.wage_pressure_note, JSON.stringify(player.raw_json ?? "")].filter(Boolean).join(" ").toLowerCase();
  const personalityBonus = noteIncludes(note, ["leader", "professional", "winner", "composed", "big-game", "elite", "star"]) ? 2.5 : 0;
  const pressurePenalty = noteIncludes(note, ["injury", "raw", "uncertain", "wage-heavy", "fragile", "risk"]) ? 2.8 : 0;
  const seasonSignal = extractSeasonSignal(player.raw_json);
  const usageBoost = seasonSignal ? usageSignal(seasonSignal) : 0;
  const outputBoost = seasonSignal ? outputSignal(seasonSignal, role) : 0;
  const consistencyBoost = seasonSignal ? consistencySignal(seasonSignal) : 0;
  const seasonImpact = usageBoost * 0.45 + outputBoost * 1.2 + consistencyBoost * 0.18;
  const age = player.age ?? 26;
  const peak = peakAgeForRole(role);
  const ageCurve = ageCurveForRole(role, age, peak);
  const categoryBonus = player.bayern_category === "first_team" ? 4.5 : player.bayern_category === "loan_return" ? 2 : 1;
  const jitter = seededJitter(player.id, -1.8, 1.8);

  const rawRating =
    38 +
    confidence * 11 +
    fit * 14.5 +
    valueSignal * 0.24 +
    ageCurve +
    categoryBonus +
    traitBonus +
    personalityBonus -
    pressurePenalty +
    seasonImpact +
    jitter;

  const rating = clamp(Math.round(rawRating), 45, 96);
  const form = clamp(
    Math.round(
      rating -
        Math.max(0, age - peak) * 1.4 +
        Math.max(0, peak - age) * 0.45 +
        confidence * 4.5 +
        (fit - 0.5) * 4.2 +
        (player.bayern_category === "youth" ? 1.5 : 0) -
        Math.max(0, 70 - player.data_confidence) * 0.04 +
        usageBoost * 0.28 +
        outputBoost * 1 +
        consistencyBoost * 0.45 +
        seededJitter(`${player.id}:form`, -3, 3),
    ),
    40,
    97,
  );

  const ceiling = clamp(Math.round(rating + Math.max(0, 28 - age) * 0.55 + (player.bayern_category === "youth" ? 4 : 2)), 48, 99);
  const floor = clamp(Math.round(rating - 14 - Math.max(0, age - peak) * 0.5), 38, 92);
  const pressure = clamp(
    Math.round(
      player.data_confidence * 0.55 +
        (player.bayern_fit_score ?? player.data_confidence * 0.72) * 0.22 +
        (player.transfer_value_max_eur_m ?? 0) * 0.12 +
        traitBonus * 3 +
        personalityBonus * 1.8 -
        pressurePenalty * 1.7 +
        usageBoost * 0.08,
    ),
    25,
    100,
  );

  return {
    rating,
    form,
    ceiling,
    floor,
    pressure,
    role,
    summary: summarizePlayer(player, rating, form),
  };
}

export function deriveTransferCandidateProfile(candidate: TransferCandidate) {
  const role = roleFromPosition(candidate.position);
  const age = Math.round((candidate.ageMin + candidate.ageMax) / 2);
  const fit = clamp(Math.round(candidate.bayernFit * 10), 0, 100);
  const ability = clamp(Math.round(candidate.ability * 10), 0, 100);
  const valueSignal = valueSignalFromRange(candidate.fee.min, candidate.fee.max);
  const traitBonus = Math.min(5, candidate.keyTraits.length * 0.9);
  const personalityText = candidate.characterNote.toLowerCase();
  const personalityBonus = noteIncludes(personalityText, ["leader", "winner", "professional", "calm", "confident", "big-game"]) ? 2 : 0;
  const pressurePenalty = noteIncludes(personalityText, ["injury", "raw", "chaos", "uncertain", "wage-heavy", "price"]) ? 1.4 : 0;
  const ageCurve = ageCurveForRole(role, age, peakAgeForRole(role));
  const jitter = seededJitter(candidate.id, -1.4, 1.4);

  const rating = clamp(Math.round(ability * 0.42 + fit * 0.32 + valueSignal * 0.16 + ageCurve + traitBonus + personalityBonus + jitter), 55, 97);
  const form = clamp(
    Math.round(
      rating -
        Math.max(0, age - peakAgeForRole(role)) * 0.9 +
        Math.max(0, peakAgeForRole(role) - age) * 0.35 +
        (candidate.realism === "Realistic" ? 3 : candidate.realism === "Medium realistic" ? 1.5 : 0) -
        pressurePenalty +
        seededJitter(`${candidate.id}:form`, -2.5, 2.5),
    ),
    48,
    96,
  );

  return {
    rating,
    form,
    fit,
    pressure: clamp(Math.round(fit * 0.45 + ability * 0.25 + valueSignal * 0.3 - pressurePenalty * 4), 30, 100),
    role,
  };
}

export function deriveRosterEntryProfile(entry: SimulationRosterEntry) {
  if (entry.kind === "catalog") {
    return deriveCatalogPlayerProfile(entry.player);
  }

  const raw = entry.player as {
    age?: number | null;
    rating?: number | null;
    form?: number | null;
    ability?: number | null;
    bayernFit?: number | null;
    fee?: number | null;
    traits?: string[] | null;
    personalityNote?: string | null;
    foot?: string | null;
  };
  const role = roleFromPosition(entry.player.position);
  const age = raw.age ?? 26;
  const ability = raw.ability ?? raw.rating ?? 78;
  const fit = raw.bayernFit ?? 75;
  const valueSignal = valueSignalFromFee(raw.fee ?? null);
  const traitBonus = Array.isArray(raw.traits) ? Math.min(4, raw.traits.length * 0.75) : 0;
  const personality = `${raw.personalityNote ?? ""} ${JSON.stringify(entry.player)}`.toLowerCase();
  const personalityBonus = noteIncludes(personality, ["leader", "professional", "winner", "composed", "big-game"]) ? 2 : 0;
  const pressurePenalty = noteIncludes(personality, ["injury", "raw", "uncertain", "wage-heavy"]) ? 1.8 : 0;
  const base =
    46 +
    ability * 0.3 +
    fit * 0.28 +
    valueSignal * 0.18 +
    ageCurveForRole(role, age, peakAgeForRole(role)) +
    traitBonus +
    personalityBonus -
    pressurePenalty +
    seededJitter(`signing:${entry.id}`, -2.2, 2.2);

  const rating = clamp(Math.round(raw.rating ?? base), 50, 97);
  const form = clamp(Math.round(raw.form ?? (rating - Math.max(0, age - peakAgeForRole(role)) * 1.1 + traitBonus + personalityBonus - pressurePenalty + seededJitter(`${entry.id}:form`, -2, 2))), 45, 97);

  return {
    rating,
    form,
    ceiling: clamp(Math.round(rating + Math.max(0, 27 - age) * 0.6), 50, 99),
    floor: clamp(Math.round(rating - 12), 40, 92),
    pressure: clamp(Math.round(ability * 0.45 + fit * 0.4 + traitBonus * 4), 30, 100),
    role,
    summary: summarizeSigning(entry.player.name, rating, form),
  };
}

export function describePlayerIdentity(player: { name: string; age: number | null; position: string | null }) {
  return `${player.name} (${ageBand(player.age)}) | ${player.position ?? "Unknown"}`;
}

function roleFromPosition(position: string | null) {
  const bucket = positionBucket(position);
  if (bucket === "GK" || bucket === "DEF" || bucket === "MID" || bucket === "ATT") return bucket;
  return "UNK";
}

function peakAgeForRole(role: "GK" | "DEF" | "MID" | "ATT" | "UNK") {
  switch (role) {
    case "GK":
      return 31;
    case "DEF":
      return 28;
    case "MID":
      return 26;
    case "ATT":
      return 24;
    default:
      return 26;
  }
}

function ageCurveForRole(role: "GK" | "DEF" | "MID" | "ATT" | "UNK", age: number, peak: number) {
  const distance = Math.abs(age - peak);
  const widePeak = role === "GK" ? 7 : role === "DEF" ? 6 : role === "MID" ? 5.5 : 5;
  const penalty = Math.max(0, distance - 2) * (role === "ATT" ? 1.1 : 0.9);
  return widePeak - penalty;
}

function valueSignalFromRange(min?: number | null, max?: number | null) {
  if (typeof min !== "number" || typeof max !== "number") return 0;
  return clamp(Math.log10(Math.max(1, (min + max) / 2) + 1) * 8, 0, 16);
}

function valueSignalFromFee(fee?: number | null) {
  if (typeof fee !== "number") return 0;
  return clamp(Math.log10(Math.max(1, fee) + 1) * 8, 0, 16);
}

function noteIncludes(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function seededJitter(seed: string, min: number, max: number) {
  const id = stableId("jitter", seed);
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = ((hash >>> 0) % 10_000) / 10_000;
  return min + (max - min) * normalized;
}

function summarizePlayer(player: PlayerRecord, rating: number, form: number) {
  const role = roleFromPosition(player.position);
  const value =
    player.transfer_value_min_eur_m && player.transfer_value_max_eur_m
      ? `€${player.transfer_value_min_eur_m}m-€${player.transfer_value_max_eur_m}m`
      : "unpriced";
  return `${player.name} | ${role} | ${ageBand(player.age)} | rating ${rating}/100 | form ${form}/100 | ${value}`;
}

function summarizeSigning(name: string, rating: number, form: number) {
  return `${name} | signing profile | rating ${rating}/100 | form ${form}/100`;
}

function extractSeasonSignal(rawJson: unknown): SeasonSignal | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const record = rawJson as Record<string, unknown>;
  const candidates = [record.season_signal, record.seasonStats, record.stats, record.season_stats];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const data = candidate as Record<string, unknown>;
    const signal: SeasonSignal = {};
    if (typeof data.apps === "number") signal.apps = data.apps;
    if (typeof data.starts === "number") signal.starts = data.starts;
    if (typeof data.minutes === "number") signal.minutes = data.minutes;
    if (typeof data.goals === "number") signal.goals = data.goals;
    if (typeof data.assists === "number") signal.assists = data.assists;
    if (typeof data.note === "string") signal.note = data.note;
    if (signal.apps !== undefined || signal.starts !== undefined || signal.minutes !== undefined || signal.goals !== undefined || signal.assists !== undefined) {
      return signal;
    }
  }
  return null;
}

function usageSignal(signal: SeasonSignal) {
  const apps = signal.apps ?? 0;
  const starts = signal.starts ?? Math.round(apps * 0.7);
  const minutes = signal.minutes ?? apps * 90;
  return clamp((minutes / 4000) * 18 + (starts / 55) * 10 + (apps / 55) * 6, 0, 32);
}

function outputSignal(signal: SeasonSignal, role: "GK" | "DEF" | "MID" | "ATT" | "UNK") {
  const goals = signal.goals ?? 0;
  const assists = signal.assists ?? 0;
  const g = role === "ATT" ? 1.9 : role === "MID" ? 1.15 : role === "DEF" ? 0.7 : 0.15;
  const a = role === "ATT" ? 1.55 : role === "MID" ? 1.35 : role === "DEF" ? 0.8 : 0.15;
  return clamp(goals * g + assists * a, 0, role === "ATT" ? 24 : role === "MID" ? 18 : role === "DEF" ? 10 : 4);
}

function consistencySignal(signal: SeasonSignal) {
  const apps = Math.max(1, signal.apps ?? 0);
  const goalContrib = (signal.goals ?? 0) + (signal.assists ?? 0);
  return clamp((goalContrib / apps) * 160, 0, 12);
}
