import type { SimulationSummary, TacticalSettings } from "../types";
import { average, clamp } from "../utils";
import { tacticalImpact } from "../simulation/tactics";
import { deriveRosterEntryProfile } from "./playerModel";
import { positionBucket } from "./normalize";

export type LineupSlotImpact = {
  slot: string;
  playerId: string;
  playerName: string;
  position: string | null;
  rating: number;
  form: number;
  fit: number;
  pressure: number;
  age: number | null;
  role: "GK" | "DEF" | "MID" | "ATT" | "UNK";
  outOfPosition: boolean;
};

export type LineupImpact = {
  selectedCount: number;
  missingCount: number;
  outOfPositionCount: number;
  startingQuality: number;
  benchQuality: number;
  attack: number;
  defence: number;
  midfield: number;
  goalkeeper: number;
  control: number;
  threat: number;
  chemistry: number;
  depth: number;
  risk: number;
  rotation: number;
  width: number;
  notes: string[];
  starters: LineupSlotImpact[];
};

export function getLineupEntryProfiles(summary: SimulationSummary) {
  const lineup = Array.isArray(summary.lineup?.lineup_json) ? (summary.lineup!.lineup_json as Array<{ slot?: unknown; playerId?: unknown }>) : [];
  const rosterMap = new Map(summary.activeRoster.map((entry) => [entry.id, entry]));
  return lineup
    .map((item) => {
      if (typeof item.slot !== "string" || typeof item.playerId !== "string") return null;
      const entry = rosterMap.get(item.playerId);
      if (!entry) return null;
      const profile = deriveRosterEntryProfile(entry);
      const position = entry.player.position ?? null;
      const fit = slotFitScore(item.slot, position);
      const role = roleFromPosition(position);
      return {
        slot: item.slot,
        playerId: item.playerId,
        playerName: entry.player.name,
        position,
        rating: profile.rating,
        form: profile.form,
        fit,
        pressure: profile.pressure,
        age: entry.kind === "catalog" ? entry.player.age ?? null : entry.player.age ?? null,
        role,
        outOfPosition: fit < 75,
      } satisfies LineupSlotImpact;
    })
    .filter((item): item is LineupSlotImpact => Boolean(item));
}

export function analyzeBayernLineup(summary: SimulationSummary, tactics?: TacticalSettings | null): LineupImpact {
  const selected = getLineupEntryProfiles(summary);
  const selectedMap = new Map(selected.map((item) => [item.playerId, item]));
  const lineup = Array.isArray(summary.lineup?.lineup_json) ? (summary.lineup!.lineup_json as Array<{ slot?: unknown; playerId?: unknown }>) : [];
  const selectedCount = selected.length;
  const missingCount = Math.max(0, lineup.length ? lineup.length - selectedCount : 11 - selectedCount);
  const outOfPositionCount = selected.filter((item) => item.outOfPosition).length;
  const baseTactics = tactics ? tacticalImpact(tactics) : { control: 50, threat: 50, risk: 50, fatigue: 50, chemistry: 50 };

  if (selectedCount === 0) {
    const rosterProfiles = summary.activeRoster
      .map((entry) => ({
        entry,
        profile: deriveRosterEntryProfile(entry),
      }))
      .sort((a, b) => b.profile.rating - a.profile.rating);
    const topEleven = rosterProfiles.slice(0, 11);
    const topBench = rosterProfiles.slice(11, 18);
    const bestElevenValue = clamp(
      Math.round(average(topEleven.map((item) => item.profile.rating * 0.62 + item.profile.form * 0.38))),
      74,
      94,
    );
    const benchValue = clamp(
      Math.round(average(topBench.map((item) => item.profile.rating * 0.58 + item.profile.form * 0.42)) || bestElevenValue - 4),
      70,
      92,
    );
    const attack = clamp(Math.round(bestElevenValue + (baseTactics.threat - 70) * 0.28), 74, 97);
    const defence = clamp(Math.round(bestElevenValue + (baseTactics.control - 70) * 0.24), 72, 96);
    const midfield = clamp(Math.round(bestElevenValue + (baseTactics.control - 70) * 0.3), 73, 96);
    const goalkeeper = clamp(
      Math.round(
        (average(
          rosterProfiles
            .filter((item) => positionBucket(item.entry.player.position ?? null) === "GK")
            .map((item) => item.profile.rating * 0.65 + item.profile.form * 0.35),
        ) || bestElevenValue - 5) + (baseTactics.control - 70) * 0.1,
      ),
      72,
      96,
    );
    const control = clamp(Math.round(bestElevenValue + 1 + (baseTactics.control - 70) * 0.34), 74, 96);
    const threat = clamp(Math.round(bestElevenValue + (baseTactics.threat - 70) * 0.36), 74, 97);
    const chemistry = clamp(Math.round(82 + Math.min(6, rosterProfiles.length * 0.12) + (baseTactics.chemistry - 50) * 0.06), 76, 96);
    const depth = clamp(Math.round(benchValue * 0.55 + Math.min(100, summary.activeRoster.length * 2.2) * 0.45), 72, 96);
    const risk = clamp(
      Math.round(
        22 +
          Math.max(0, 80 - depth) * 0.34 +
          Math.max(0, (tactics?.defensiveLineHeight ?? 72) - 72) * 0.45 +
          Math.max(0, (tactics?.pressingIntensity ?? 70) - 74) * 0.28 +
          Math.max(0, (tactics?.ballsInBehindRisk ?? 55) - 55) * 0.18 +
          (tactics?.pressingMode === "man" ? 5 : 1) -
          (goalkeeper - 70) * 0.05,
      ),
      0,
      100,
    );
    const rotation = clamp(
      Math.round(
        (tactics?.rotationLevel ?? 36) * 0.42 +
          Math.max(0, 78 - bestElevenValue) * 0.28 +
          Math.max(0, 74 - benchValue) * 0.3,
      ),
      0,
      100,
    );
    const notes = ["No XI was selected, so Bayern were simulated from a squad-based best XI baseline."];
    return {
      selectedCount: 11,
      missingCount: 0,
      outOfPositionCount: 0,
      startingQuality: bestElevenValue,
      benchQuality: benchValue,
      attack,
      defence,
      midfield,
      goalkeeper,
      control,
      threat,
      chemistry,
      depth,
      risk,
      rotation,
      width: clamp(Math.round(74 + (tactics?.wingerWidth ?? 70) * 0.18), 40, 96),
      notes,
      starters: topEleven.slice(0, 11).map((item, index) => ({
        slot: `AUTO-${index + 1}`,
        playerId: item.entry.id,
        playerName: item.entry.player.name,
        position: item.entry.kind === "catalog" ? item.entry.player.position ?? null : item.entry.player.position ?? null,
        rating: item.profile.rating,
        form: item.profile.form,
        fit: 88,
        pressure: item.profile.pressure,
        age: item.entry.kind === "catalog" ? item.entry.player.age ?? null : item.entry.player.age ?? null,
        role: positionBucket(item.entry.player.position ?? null) as "GK" | "DEF" | "MID" | "ATT" | "UNK",
        outOfPosition: false,
      })),
    };
  }

  const slotScores = selected.map((item) => {
    const raw = item.rating * 0.58 + item.form * 0.42;
    const fitFactor = 0.7 + item.fit / 250;
    return {
      ...item,
      score: raw * fitFactor,
    };
  });

  const startingQuality = clamp(Math.round(average(slotScores.map((item) => item.score))), 45, 96);
  const benchCandidates = summary.activeRoster
    .filter((entry) => !selectedMap.has(entry.id))
    .map((entry) => {
      const profile = deriveRosterEntryProfile(entry);
      const position = entry.kind === "catalog" ? entry.player.position ?? null : entry.player.position ?? null;
      const preferredRole = roleFromPosition(position);
      const age = entry.kind === "catalog" ? entry.player.age ?? 26 : entry.player.age ?? 26;
      const vers = preferredRole === "UNK" ? 0.92 : 1;
      const youthBoost = age <= 21 ? 0.9 : 1;
      return (profile.rating * 0.62 + profile.form * 0.38) * vers * youthBoost;
    })
    .sort((a, b) => b - a);

  const benchQuality = clamp(Math.round(benchCandidates.length ? average(benchCandidates.slice(0, 7)) : startingQuality - 8), 40, 94);
  const depth = clamp(Math.round(benchQuality * 0.55 + Math.min(100, summary.activeRoster.length * 2.3) * 0.45), 38, 96);

  const groupAverage = (slots: string[]) => {
    const group = slotScores.filter((item) => slots.some((slot) => slotMatches(item.slot, slot)));
    return group.length ? average(group.map((item) => item.score)) : null;
  };

  const goalkeeper = clamp(Math.round(groupAverage(["GK"]) ?? startingQuality * 0.55), 35, 96);
  const defence = clamp(
    Math.round(
      (groupAverage(["GK"]) ?? 0) * 0.18 +
        (groupAverage(["CB", "LCB", "RCB"]) ?? 0) * 0.5 +
        (groupAverage(["LB", "LWB", "RB", "RWB"]) ?? 0) * 0.24 +
        (groupAverage(["DM"]) ?? 0) * 0.08 +
        baseTactics.control * 0.04,
    ),
    38,
    96,
  );
  const midfield = clamp(
    Math.round(
      (groupAverage(["DM"]) ?? 0) * 0.34 +
        (groupAverage(["CM"]) ?? 0) * 0.4 +
        (groupAverage(["AM"]) ?? 0) * 0.2 +
        baseTactics.control * 0.06,
    ),
    38,
    96,
  );
  const attack = clamp(
    Math.round(
      (groupAverage(["AM"]) ?? 0) * 0.24 +
        (groupAverage(["LW", "RW"]) ?? 0) * 0.34 +
        (groupAverage(["ST"]) ?? 0) * 0.42 +
        baseTactics.threat * 0.05,
    ),
    40,
    97,
  );

  const width = clamp(
    Math.round(
      (groupAverage(["LB", "LWB", "RB", "RWB"]) ?? 0) * 0.18 +
        (groupAverage(["LW", "RW"]) ?? 0) * 0.42 +
        (tactics ? tactics.wingerWidth : 70) * 0.36,
    ),
    38,
    96,
  );

  const control = clamp(
    Math.round(
      midfield * 0.38 +
        defence * 0.16 +
        attack * 0.14 +
        (groupAverage(["DM"]) ?? 0) * 0.1 +
        baseTactics.control * 0.18,
    ),
    40,
    96,
  );
  const threat = clamp(
    Math.round(
      attack * 0.46 +
        width * 0.14 +
        (groupAverage(["ST"]) ?? 0) * 0.2 +
        (groupAverage(["AM"]) ?? 0) * 0.1 +
        baseTactics.threat * 0.1,
    ),
    42,
    97,
  );

  const chemistryBase = average(slotScores.map((item) => item.fit)) || 78;
  const formSpread = slotScores.length ? Math.max(...slotScores.map((item) => item.form)) - Math.min(...slotScores.map((item) => item.form)) : 0;
  const ageSpread = slotScores.length
    ? Math.max(...slotScores.map((item) => item.age ?? 26)) - Math.min(...slotScores.map((item) => item.age ?? 26))
    : 0;
  const chemistry = clamp(
    Math.round(
      chemistryBase * 0.6 +
        baseTactics.chemistry * 0.24 +
        Math.max(0, 16 - outOfPositionCount * 4) +
        Math.max(0, 12 - formSpread * 0.45) +
        Math.max(0, 10 - ageSpread * 0.35),
    ),
    35,
    96,
  );

  const risk = clamp(
    Math.round(
      18 +
        outOfPositionCount * 3.4 +
        Math.max(0, 82 - depth) * 0.24 +
        Math.max(0, (tactics?.defensiveLineHeight ?? 72) - 72) * 0.34 +
        Math.max(0, (tactics?.pressingIntensity ?? 70) - 74) * 0.22 +
        Math.max(0, (tactics?.ballsInBehindRisk ?? 55) - 55) * 0.16 +
        (tactics?.pressingMode === "man" ? 4 : 1) -
        (tactics?.rotationLevel ?? 36) * 0.05 -
        (groupAverage(["GK"]) ?? 70) * 0.05,
    ),
    0,
    100,
  );

  const rotation = clamp(
    Math.round(
      (tactics?.rotationLevel ?? 36) * 0.45 +
        Math.max(0, 72 - startingQuality) * 0.4 +
        Math.max(0, 70 - benchQuality) * 0.35 +
        Math.max(0, 5 - Math.min(selectedCount, 5)) * 4,
    ),
    0,
    100,
  );

  const notes: string[] = [];
  if (outOfPositionCount) {
    notes.push(`${outOfPositionCount} starter${outOfPositionCount > 1 ? "s" : ""} are not in a natural slot.`);
  }
  if (benchQuality < 70) {
    notes.push("The first reserve layer is thinner than Bayern standard.");
  }
  if (chemistry < 72) {
    notes.push("The XI needs more rhythm or clearer role symmetry.");
  }
  if (tactics && tactics.pressingIntensity >= 80 && tactics.defensiveLineHeight >= 78 && risk >= 55) {
    notes.push("The press is aggressive enough to create chances but also expose space behind.");
  }
  if (tactics && tactics.fullbackRole === "inverted" && width < 72) {
    notes.push("Fullbacks are helping control centrally but the wide cover is more fragile.");
  }

  return {
    selectedCount,
    missingCount,
    outOfPositionCount,
    startingQuality,
    benchQuality,
    attack,
    defence,
    midfield,
    goalkeeper,
    control,
    threat,
    chemistry,
    depth,
    risk,
    rotation,
    width,
    notes,
    starters: slotScores.map((item) => ({
      slot: item.slot,
      playerId: item.playerId,
      playerName: item.playerName,
      position: item.position,
      rating: item.rating,
      form: item.form,
      fit: item.fit,
      pressure: item.pressure,
      age: item.age,
      role: item.role,
      outOfPosition: item.outOfPosition,
    })),
  };
}

export function slotFitScore(slot: string, position: string | null | undefined) {
  const slotRole = roleFromSlot(slot);
  const playerRole = roleFromPosition(position);
  if (slotRole === "GK") {
    return playerRole === "GK" ? 100 : 34;
  }
  if (slotRole === playerRole) {
    return 100;
  }
  if (slotRole === "DEF" && playerRole === "MID") {
      return positionBucket(position ?? null).includes("MID") ? 82 : 74;
  }
  if (slotRole === "MID" && playerRole === "DEF") {
    return positionBucket(position ?? null).includes("DEF") ? 80 : 72;
  }
  if (slotRole === "ATT" && playerRole === "MID") {
    return positionBucket(position ?? null).includes("MID") ? 84 : 70;
  }
  if (slotRole === "MID" && playerRole === "ATT") {
    return positionBucket(position ?? null).includes("ATT") ? 84 : 70;
  }
  if (slotRole === "DEF" && playerRole === "ATT") {
    return 54;
  }
  if (slotRole === "ATT" && playerRole === "DEF") {
    return 46;
  }
  return 62;
}

function roleFromSlot(slot: string): "GK" | "DEF" | "MID" | "ATT" | "UNK" {
  const value = slot.toUpperCase();
  if (value === "GK") return "GK";
  if (value.includes("CB") || value.includes("LB") || value.includes("RB") || value.includes("WB")) return "DEF";
  if (value.includes("DM") || value.includes("CM")) return "MID";
  if (value.includes("AM") || value.includes("LW") || value.includes("RW") || value.includes("ST")) return "ATT";
  return "UNK";
}

function roleFromPosition(position: string | null | undefined): "GK" | "DEF" | "MID" | "ATT" | "UNK" {
  const bucket = positionBucket(position ?? null);
  if (bucket === "GK" || bucket === "DEF" || bucket === "MID" || bucket === "ATT") return bucket;
  return "UNK";
}

function slotMatches(slot: string, needle: string) {
  return slot.toUpperCase().includes(needle);
}
