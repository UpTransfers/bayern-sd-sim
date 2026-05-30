import type { ClubRecord, MatchRecord, PlayerRecord, StandingRecord } from "../types";
import { clamp } from "../utils";

export function calculateConfidence(fields: {
  dateOfBirth: string | null;
  nationality: string | null;
  position: string | null;
  shirtNumber: string | null;
  photoUrl: string | null;
  currentClubId: string | null;
}) {
  let score = 100;
  if (!fields.dateOfBirth) score -= 14;
  if (!fields.nationality) score -= 12;
  if (!fields.position) score -= 18;
  if (!fields.shirtNumber) score -= 6;
  if (!fields.photoUrl) score -= 10;
  if (!fields.currentClubId) score -= 18;
  return clamp(score, 25, 100);
}

export function sourceConfidenceBonus(source: string) {
  switch (source) {
    case "football-data":
      return 10;
    case "wikidata":
      return 7;
    case "openligadb":
      return 12;
    case "thesportsdb":
      return 5;
    default:
      return 0;
  }
}

export function dataCoverageScore(input: {
  club: ClubRecord | null;
  players: PlayerRecord[];
  matches: MatchRecord[];
  standing: StandingRecord | null;
}) {
  let score = 0;
  if (input.club) score += 25;
  if (input.players.length >= 18) score += 30;
  else score += input.players.length * 1.5;
  if (input.matches.length >= 5) score += 20;
  else score += input.matches.length * 3;
  if (input.standing) score += 25;
  return clamp(score, 0, 100);
}

export function averagePlayerConfidence(players: PlayerRecord[]) {
  if (!players.length) return 0;
  return Math.round(
    players.reduce((sum, player) => sum + player.data_confidence, 0) / players.length,
  );
}
