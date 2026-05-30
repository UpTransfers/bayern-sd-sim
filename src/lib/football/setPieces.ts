import type { SimulationRosterEntry, SimulationSummary, TacticalSettings } from "../types";
import { average, clamp } from "../utils";
import { analyzeBayernLineup, slotFitScore } from "./lineupImpact";
import { deriveRosterEntryProfile } from "./playerModel";
import { normalizeTactics } from "../simulation/tactics";

type SetPieceChoice = {
  id?: string;
  name: string;
  score: number;
  role: string;
  reason: string;
  manual?: boolean;
};

export type SetPiecePlan = {
  captain: SetPieceChoice;
  penaltyTaker: SetPieceChoice;
  freeKickTaker: SetPieceChoice;
  cornerTaker: SetPieceChoice;
  setPieceRating: number;
  captainInfluence: number;
  offensiveEdge: number;
  penaltyEdge: number;
  notes: string[];
};

type SeasonSignal = {
  goals?: number;
  assists?: number;
  apps?: number;
  starts?: number;
  minutes?: number;
  note?: string;
};

export function buildBayernSetPiecePlan(
  summary: SimulationSummary,
  tactics?: TacticalSettings | null,
  lineupImpact?: ReturnType<typeof analyzeBayernLineup> | null,
): SetPiecePlan {
  const normalizedTactics = normalizeTactics(tactics ?? summary.simulation.tactics_json ?? null);
  const impact = lineupImpact ?? analyzeBayernLineup(summary, normalizedTactics);
  const lineup = Array.isArray(summary.lineup?.lineup_json)
    ? (summary.lineup!.lineup_json as Array<{ slot?: unknown; playerId?: unknown }>)
    : [];
  const selectedStarters = new Set(
    lineup
      .filter((item) => typeof item.playerId === "string")
      .map((item) => String(item.playerId)),
  );
  const completeXI = selectedStarters.size >= 11;
  const pool = completeXI ? summary.activeRoster.filter((entry) => selectedStarters.has(entry.id)) : summary.activeRoster;
  const lineupMap = new Map(
    lineup.flatMap((item) => {
      if (typeof item.slot !== "string" || typeof item.playerId !== "string") return [];
      return [[item.playerId, item.slot] as const];
    }),
  );

  const candidates = pool.map((entry) => {
    const profile = deriveRosterEntryProfile(entry);
    const position = entry.player.position ?? null;
    const slot = lineupMap.get(entry.id) ?? null;
    const fit = slot ? slotFitScore(slot, position) : 82;
    const age = entry.player.age ?? 26;
    const role = setPieceRole(position, profile.role);
    const traits = collectTraits(entry);
    const signal = extractSeasonSignal(entry);
    const goalContribution = (signal?.goals ?? 0) * 0.18 + (signal?.assists ?? 0) * 0.12;
    const leadershipBonus = hasAny(traits, ["leader", "captain", "professional", "winner", "calm", "big-game", "composed"]) ? 4 : 0;
    const technicalBonus = hasAny(traits, ["passing", "vision", "technique", "distribution", "crossing", "delivery"]) ? 2.6 : 0;
    const deadBallBonus = hasAny(traits, ["penalties", "free-kicks", "corners", "set pieces"]) ? 5 : 0;
    const footBonus = entry.player.foot === "Left" ? 1.3 : entry.player.foot === "Right" ? 0.8 : 0;
    const starterBonus = slot ? 2.2 : 0;
    const controlBonus = Math.max(0, impact.control - 70) * 0.05;
    const chemistryBonus = Math.max(0, impact.chemistry - 72) * 0.03;
    const pressure = profile.pressure;
    const preferenceBonus = preferredRoleBoost(entry.player.name);

    const captainScore =
      profile.rating * 0.22 +
      profile.form * 0.18 +
      pressure * 0.16 +
      starterBonus +
      controlBonus +
      chemistryBonus +
      leadershipBonus +
      preferenceBonus.captain +
      (role === "MID" ? 5.8 : role === "DEF" ? 5.2 : role === "GK" ? 4.8 : 2.5) +
      Math.max(0, 31 - age) * 0.08 -
      Math.max(0, age - 32) * 0.12 +
      (fit - 80) * 0.03;

    const penaltyScore =
      profile.rating * 0.23 +
      profile.form * 0.2 +
      pressure * 0.1 +
      starterBonus +
      goalContribution +
      deadBallBonus +
      technicalBonus +
      footBonus +
      preferenceBonus.penalty +
      (role === "ATT" ? 8.4 : role === "MID" ? 5.8 : role === "DEF" ? 1.3 : 0.2) +
      Math.max(0, 29 - age) * 0.06 -
      Math.max(0, age - 33) * 0.14 +
      (fit - 80) * 0.025;

    const freeKickScore =
      profile.rating * 0.2 +
      profile.form * 0.18 +
      pressure * 0.08 +
      starterBonus +
      goalContribution * 0.6 +
      technicalBonus +
      deadBallBonus * 0.8 +
      footBonus +
      preferenceBonus.freeKick +
      (role === "MID" ? 7.2 : role === "ATT" ? 6.6 : role === "DEF" ? 2.4 : 0.4) +
      Math.max(0, 30 - age) * 0.05 -
      Math.max(0, age - 31) * 0.11 +
      (fit - 80) * 0.025;

    const cornerScore =
      profile.rating * 0.18 +
      profile.form * 0.16 +
      pressure * 0.06 +
      starterBonus +
      goalContribution * 0.5 +
      technicalBonus * 0.8 +
      deadBallBonus * 0.6 +
      preferenceBonus.corner +
      (role === "ATT" ? 7.5 : role === "MID" ? 6.1 : role === "DEF" ? 4.2 : 0.5) +
      Math.max(0, 28 - age) * 0.04 -
      Math.max(0, age - 31) * 0.08 +
      (fit - 80) * 0.03;

    return {
      id: entry.id,
      name: rosterName(entry),
      role,
      captainScore,
      penaltyScore,
      freeKickScore,
      cornerScore,
      summary: profile.summary,
      traits,
    };
  });

  const manual = summary.simulation.set_pieces_json ?? null;
  const captain = pickBest(candidates, "captain", [], manual?.captainId ?? null);
  const penaltyTaker = pickBest(candidates, "penalty", captainHasManual(captain) ? [] : captain.name, manual?.penaltyTakerId ?? null);
  const freeKickTaker = pickBest(
    candidates,
    "freeKick",
    manual?.freeKickTakerId ? [] : [captain.name, penaltyTaker.name],
    manual?.freeKickTakerId ?? null,
  );
  const cornerTaker = pickBest(
    candidates,
    "corner",
    manual?.cornerTakerId ? [] : [captain.name, penaltyTaker.name, freeKickTaker.name],
    manual?.cornerTakerId ?? null,
  );

  const setPieceRating = clamp(
    Math.round(
      average([captain.score, penaltyTaker.score, freeKickTaker.score, cornerTaker.score]) +
        impact.control * 0.07 +
        impact.threat * 0.05 +
        impact.chemistry * 0.05 +
        normalizedTactics.pivotSecurity * 0.04,
    ),
    48,
    96,
  );

  const captainInfluence = clamp(
    Math.round(captain.score * 0.58 + impact.chemistry * 0.14 + normalizedTactics.rotationLevel * 0.03),
    36,
    97,
  );

  const offensiveEdge = clamp(
    Math.round(
      setPieceRating * 0.36 +
        penaltyTaker.score * 0.18 +
        freeKickTaker.score * 0.16 +
        cornerTaker.score * 0.14 +
        captainInfluence * 0.08,
    ),
    34,
    98,
  );

  const penaltyEdge = clamp(
    Math.round(penaltyTaker.score * 0.44 + captainInfluence * 0.08 + normalizedTactics.buildUpSpeed * 0.04),
    30,
    98,
  );

  const notes = [
    "Dead-ball moments matter more in tight home and knockout matches.",
    captain.score >= 78 ? `${captain.name} gives Bayern structure and set-piece authority.` : "No single natural leader dominates the dead-ball hierarchy.",
    manual ? "Manual set-piece choices are active and influence close-match, penalty, and cup variance." : "Auto-selected set-piece hierarchy is active.",
  ];

  return {
    captain: toChoice(captain, "Captain"),
    penaltyTaker: toChoice(penaltyTaker, "Penalty taker"),
    freeKickTaker: toChoice(freeKickTaker, "Free-kick taker"),
    cornerTaker: toChoice(cornerTaker, "Corner taker"),
    setPieceRating,
    captainInfluence,
    offensiveEdge,
    penaltyEdge,
    notes,
  };
}

function preferredRoleBoost(name: string) {
  const normalized = normalizeName(name);
  const captainOrder = ['manuel neuer', 'joshua kimmich', 'jonathan tah', 'harry kane'];
  const penaltyOrder = ['harry kane', 'jamal musiala', 'joshua kimmich', 'michael olise'];
  const cornerOrder = ['michael olise', 'joshua kimmich', 'aleksandar pavlovic', 'tom bischof'];
  const freeKickOrder = ['michael olise', 'harry kane', 'joshua kimmich'];
  return {
    captain: orderedBoost(normalized, captainOrder),
    penalty: orderedBoost(normalized, penaltyOrder),
    freeKick: orderedBoost(normalized, freeKickOrder),
    corner: orderedBoost(normalized, cornerOrder),
  };
}

function orderedBoost(name: string, order: string[]) {
  const index = order.findIndex((item) => item === name);
  if (index === -1) return 0;
  return [28, 22, 16, 10, 8, 6][index] ?? 4;
}

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function captainHasManual(value: unknown) {
  return Boolean(value && typeof value === "object" && "manual" in value && (value as { manual?: boolean }).manual);
}

function pickBest(
  candidates: Array<{
    id: string;
    name: string;
    role: string;
    captainScore: number;
    penaltyScore: number;
    freeKickScore: number;
    cornerScore: number;
    summary: string;
    traits: string[];
  }>,
  kind: "captain" | "penalty" | "freeKick" | "corner",
  used: string | string[] = [],
  forcedId: string | null = null,
) {
  const usedSet = new Set(Array.isArray(used) ? used : [used]);
  const ranked = candidates
    .map((item) => {
      const base = kind === "captain" ? item.captainScore : kind === "penalty" ? item.penaltyScore : kind === "freeKick" ? item.freeKickScore : item.cornerScore;
      const duplicatePenalty = usedSet.has(item.name) ? 12 : 0;
      let rolePenalty = 0;
      if (kind === "penalty" && item.role === "GK") {
        rolePenalty = 14;
      }
      if (kind === "freeKick" && item.role === "GK") {
        rolePenalty = 10;
      }
      if (kind === "corner" && item.role === "GK") {
        rolePenalty = 10;
      }
      return { ...item, score: base - duplicatePenalty - rolePenalty };
    })
    .sort((a, b) => b.score - a.score);
  if (forcedId) {
    const forced = ranked.find((item) => item.id === forcedId);
    if (forced) {
      return { ...forced, manual: true };
    }
  }
  return ranked[0] ?? {
    id: "unknown",
    name: "Unknown",
    role: "UNK",
    captainScore: 0,
    penaltyScore: 0,
    freeKickScore: 0,
    cornerScore: 0,
    score: 0,
    summary: "",
    traits: [],
    manual: false,
  };
}

function toChoice(
  item: {
    id?: string;
    name: string;
    score: number;
    role: string;
    summary: string;
    traits: string[];
    manual?: boolean;
  },
  label: string,
) {
  const reason = buildReason(item, label);
  return {
    id: item.id,
    name: item.name,
    score: Math.round(item.score),
    role: item.role,
    reason: item.manual ? `${reason} Manually selected by the director.` : reason,
    manual: item.manual,
  };
}

function buildReason(
  item: {
    role: string;
    summary: string;
    traits: string[];
  },
  label: string,
) {
  const traits = item.traits.join(", ");
  if (label === "Captain") {
    return item.role === "MID"
      ? "Control, leadership and structure."
      : item.role === "DEF"
        ? "Defensive command and game control."
        : item.role === "GK"
          ? "Organisation, calm and authority."
          : "Experience and on-pitch authority.";
  }
  if (label === "Penalty taker") {
    return item.role === "ATT"
      ? "Best finishing profile under pressure."
      : item.role === "MID"
        ? "Composed enough, but not the first-choice scorer."
        : "Backup option if the frontline is unavailable.";
  }
  if (label === "Free-kick taker") {
    return traits.includes("vision") || traits.includes("technique") || traits.includes("passing")
      ? "Technique and delivery."
      : "Reliable technique and placement.";
  }
  return traits.includes("crossing") || traits.includes("delivery") || traits.includes("vision")
    ? "Delivery, touch and good crossing rhythm."
    : "Good delivery and dead-ball timing.";
}

function extractSeasonSignal(entry: SimulationRosterEntry): SeasonSignal | null {
  if (entry.kind !== "catalog") return null;
  const raw = entry.player.raw_json;
  if (!raw || typeof raw !== "object") return null;
  const signal = (raw as { season_signal?: unknown }).season_signal;
  if (!signal || typeof signal !== "object") return null;
  const typed = signal as SeasonSignal;
  return {
    goals: typeof typed.goals === "number" ? typed.goals : undefined,
    assists: typeof typed.assists === "number" ? typed.assists : undefined,
    apps: typeof typed.apps === "number" ? typed.apps : undefined,
    starts: typeof typed.starts === "number" ? typed.starts : undefined,
    minutes: typeof typed.minutes === "number" ? typed.minutes : undefined,
    note: typeof typed.note === "string" ? typed.note : undefined,
  };
}

function collectTraits(entry: SimulationRosterEntry) {
  const directTraits = Array.isArray(entry.player.traits) ? entry.player.traits : [];
  const rawTraits =
    entry.kind === "catalog" && entry.player.raw_json && typeof entry.player.raw_json === "object"
      ? ((entry.player.raw_json as { traits?: unknown }).traits as string[] | undefined)
      : undefined;
  const base = [...directTraits, ...(Array.isArray(rawTraits) ? rawTraits : [])];
  return [...new Set(base.map((trait) => String(trait).toLowerCase()))];
}

function setPieceRole(position: string | null, fallback: string) {
  const normalized = (position ?? "").toLowerCase();
  if (!normalized) return fallback;
  if (normalized.includes("goalkeeper") || normalized === "gk") return "GK";
  if (normalized.includes("back") || normalized.includes("defender") || normalized.includes("cb") || normalized.includes("lb") || normalized.includes("rb")) return "DEF";
  if (normalized.includes("mid") || normalized.includes("dm") || normalized.includes("cm") || normalized.includes("am")) return "MID";
  if (
    normalized.includes("wing") ||
    normalized.includes("forward") ||
    normalized.includes("striker") ||
    normalized.includes("rw") ||
    normalized.includes("lw") ||
    normalized.includes("st") ||
    normalized.includes("ss")
  ) {
    return "ATT";
  }
  return fallback;
}

function hasAny(value: string[], needles: string[]) {
  const joined = value.join(" ");
  return needles.some((needle) => joined.includes(needle));
}

function rosterName(entry: SimulationRosterEntry) {
  return entry.kind === "catalog" ? entry.player.name : entry.player.name;
}
