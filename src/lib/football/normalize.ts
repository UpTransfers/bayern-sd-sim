import type { ClubRecord, MatchRecord, PlayerRecord, StandingRecord } from "../types";
import { clamp, stableId } from "../utils";
import { calculateConfidence } from "./confidence";

export function calculateAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const diff = Date.now() - dob.getTime();
  return Math.max(0, Math.floor(diff / 31_556_952_000));
}

export function normalizeClub(input: {
  externalSource: ClubRecord["external_source"];
  externalId: string;
  name: string;
  shortName?: string | null;
  country?: string | null;
  crestUrl?: string | null;
  venue?: string | null;
  founded?: string | null;
  rawJson: unknown;
}): ClubRecord {
  return {
    id: stableId("club", input.externalSource, input.externalId),
    external_source: input.externalSource,
    external_id: input.externalId,
    name: input.name,
    short_name: input.shortName ?? null,
    country: input.country ?? null,
    crest_url: input.crestUrl ?? null,
    venue: input.venue ?? null,
    founded: input.founded ?? null,
    raw_json: input.rawJson,
    last_synced_at: new Date().toISOString(),
  };
}

export function normalizePlayer(input: {
  externalSource: PlayerRecord["external_source"];
  externalId: string;
  name: string;
  dateOfBirth?: string | null;
  nationality?: string | null;
  position?: string | null;
  shirtNumber?: string | null;
  currentClubId?: string | null;
  photoUrl?: string | null;
  rawJson: unknown;
}): PlayerRecord {
  const age = calculateAge(input.dateOfBirth ?? null);
  const confidence = calculateConfidence({
    dateOfBirth: input.dateOfBirth ?? null,
    nationality: input.nationality ?? null,
    position: input.position ?? null,
    shirtNumber: input.shirtNumber ?? null,
    photoUrl: input.photoUrl ?? null,
    currentClubId: input.currentClubId ?? null,
  });

  return {
    id: stableId("player", input.externalSource, input.externalId),
    external_source: input.externalSource,
    external_id: input.externalId,
    name: input.name,
    date_of_birth: input.dateOfBirth ?? null,
    age,
    nationality: input.nationality ?? null,
    position: input.position ?? null,
    shirt_number: input.shirtNumber ?? null,
    current_club_id: input.currentClubId ?? null,
    photo_url: input.photoUrl ?? null,
    data_confidence: confidence,
    raw_json: input.rawJson,
    last_synced_at: new Date().toISOString(),
  };
}

export function normalizeMatch(input: {
  externalSource: MatchRecord["external_source"];
  externalId: string;
  competition: string;
  season: string;
  matchday?: number | null;
  utcDate?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status: string;
  rawJson: unknown;
}): MatchRecord {
  return {
    id: stableId("match", input.externalSource, input.externalId),
    external_source: input.externalSource,
    external_id: input.externalId,
    competition: input.competition,
    season: input.season,
    matchday: input.matchday ?? null,
    utc_date: input.utcDate ?? null,
    home_team: input.homeTeam,
    away_team: input.awayTeam,
    home_score: input.homeScore ?? null,
    away_score: input.awayScore ?? null,
    status: input.status,
    raw_json: input.rawJson,
    last_synced_at: new Date().toISOString(),
  };
}

export function normalizeStanding(input: {
  externalSource: StandingRecord["external_source"];
  competition: string;
  season: string;
  clubName: string;
  position: number;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  goalDifference?: number | null;
  points?: number | null;
  rawJson: unknown;
}): StandingRecord {
  return {
    id: stableId("standing", input.externalSource, input.competition, input.season, input.clubName),
    external_source: input.externalSource,
    competition: input.competition,
    season: input.season,
    club_name: input.clubName,
    position: input.position,
    played: input.played ?? null,
    won: input.won ?? null,
    drawn: input.drawn ?? null,
    lost: input.lost ?? null,
    goals_for: input.goalsFor ?? null,
    goals_against: input.goalsAgainst ?? null,
    goal_difference: input.goalDifference ?? null,
    points: input.points ?? null,
    raw_json: input.rawJson,
    last_synced_at: new Date().toISOString(),
  };
}

export function normalizePosition(position: string | null | undefined) {
  if (!position) return null;
  const normalized = position.toLowerCase();
  const compact = normalized.toUpperCase();
  if (normalized.includes("goalkeeper")) return "GK";
  if (/\bGK\b/.test(compact)) return "GK";
  if (normalized.includes("defender") || /\b(CB|LB|RB|LWB|RWB|WB)\b/.test(compact)) return "DEF";
  if (normalized.includes("midfielder") || /\b(DM|CM|AM|MID)\b/.test(compact)) return "MID";
  if (normalized.includes("forward") || normalized.includes("striker") || /\b(ST|SS|LW|RW|FWD|ATT)\b/.test(compact)) return "FWD";
  if (normalized.includes("wing")) return "WING";
  return compact;
}

export function estimateSquadNeed(position: string | null, neededPositions: string[]) {
  if (!position) return 45;
  const normalized = position.toUpperCase();
  if (neededPositions.some((item) => normalized.includes(item))) return 85;
  if (normalized.includes("GK")) return 70;
  if (normalized.includes("CB") || normalized.includes("DEF")) return 75;
  if (normalized.includes("MID")) return 68;
  if (normalized.includes("FWD") || normalized.includes("WING")) return 82;
  return 58;
}

export function ageBand(age: number | null) {
  if (age === null) return "Unknown";
  if (age <= 21) return "U22";
  if (age <= 24) return "22-24";
  if (age <= 28) return "25-28";
  if (age <= 31) return "29-31";
  return "32+";
}

export function positionBucket(position: string | null) {
  const normalized = normalizePosition(position);
  if (!normalized) return "Unknown";
  if (normalized.includes("GK")) return "GK";
  if (normalized.includes("DEF")) return "DEF";
  if (normalized.includes("MID")) return "MID";
  if (normalized.includes("FWD") || normalized.includes("WING")) return "ATT";
  return normalized;
}

export function sumBy<T>(items: T[], mapper: (item: T) => number) {
  return items.reduce((sum, item) => sum + mapper(item), 0);
}

export function countBy<T>(items: T[], predicate: (item: T) => boolean) {
  return items.reduce((sum, item) => sum + (predicate(item) ? 1 : 0), 0);
}

export function percentile(values: number[], value: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = sorted.findIndex((item) => item >= value);
  if (index < 0) return 100;
  return Math.round((index / sorted.length) * 100);
}

export function roundToNearest(value: number, nearest = 1) {
  return Math.round(value / nearest) * nearest;
}

export function bounded(value: number, min: number, max: number) {
  return clamp(value, min, max);
}
