import type { ClubRecord, PlayerRecord } from "@/lib/types";
import { bayernLoanReturns, bayernSeasonSignals2025_26, bayernSquad2026, bayernYouthProspects } from "./bayern2026";

const syncedAt = "2026-05-28T00:00:00.000Z";

export const fallbackBayernClub: ClubRecord = {
  id: "club_manual_bayern",
  external_source: "manual",
  external_id: "manual-bayern-munich",
  name: "FC Bayern Munich",
  short_name: "Bayern",
  country: "Germany",
  crest_url: null,
  venue: "Allianz Arena",
  founded: "1900-02-27",
  raw_json: {
    source_note: "Built-in Bayern fallback data for offline testing.",
  },
  last_synced_at: syncedAt,
};

function toPlayer(record: {
  id: string;
  name: string;
  shirtNumber: number | null;
  age: number;
  position: string;
  category: "first_team" | "loan_return" | "youth";
  contract: string;
  transferValue: { min: number; max: number };
  notes: string;
}): PlayerRecord {
  return {
    id: `player_manual_${record.id}`,
    external_source: "manual",
    external_id: `manual-${record.id}`,
    name: record.name,
    date_of_birth: null,
    age: record.age,
    nationality: null,
    position: record.position,
    shirt_number: record.shirtNumber === null ? null : String(record.shirtNumber),
    current_club_id: fallbackBayernClub.id,
    photo_url: null,
    data_confidence: record.category === "first_team" ? 78 : record.category === "loan_return" ? 66 : 60,
    raw_json: {
      category: record.category,
      contract: record.contract,
      transfer_value: record.transferValue,
      notes: record.notes,
      season_signal: bayernSeasonSignals2025_26[record.id] ?? null,
    },
    last_synced_at: syncedAt,
    bayern_category: record.category,
    transfer_value_min_eur_m: record.transferValue.min,
    transfer_value_max_eur_m: record.transferValue.max,
    wage_pressure_note: record.category === "first_team" ? "starter hierarchy" : "development / returner",
    traits: [],
    personality_note: record.notes,
    foot: null,
  };
}

export const fallbackBayernPlayers: PlayerRecord[] = [
  ...bayernSquad2026.map(toPlayer),
  ...bayernLoanReturns.map(toPlayer),
  ...bayernYouthProspects.map(toPlayer),
];
