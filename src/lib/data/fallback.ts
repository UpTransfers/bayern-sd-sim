import type { ClubRecord, PlayerRecord, Store } from "@/lib/types";
import { bayernFallbackResearchBaseline, bayernFallbackResearchPlayers } from "./bayernFallback2026Research";

const syncedAt = "2026-05-28T00:00:00.000Z";

export const fallbackBayernClub: ClubRecord = {
  id: "club_manual_bayern",
  external_source: "manual",
  external_id: "manual-bayern-munich",
  name: "FC Bayern Munich",
  short_name: "Bayern",
  country: "Germany",
  crest_url: null,
  venue: bayernFallbackResearchBaseline.squad.stadium,
  founded: "1900-02-27",
  raw_json: {
    source_label: bayernFallbackResearchBaseline.source_label,
    source_note: bayernFallbackResearchBaseline.source_note,
    season_baseline: bayernFallbackResearchBaseline,
  },
  last_synced_at: syncedAt,
};

function toPlayer(record: (typeof bayernFallbackResearchPlayers)[number]): PlayerRecord {
  const [minValue, maxValue] = [record.external_reference_value.min, record.external_reference_value.max];
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
    data_confidence: record.category === "first_team" ? 84 : record.category === "loan_return" ? 74 : 70,
    raw_json: {
      category: record.category,
      contract: record.contract,
      external_reference_value: record.external_reference_value,
      notes: record.notes,
      player_importance: record.player_importance,
      fan_importance: record.fan_importance,
      board_sale_stance: record.board_sale_stance,
      wage_tier: record.wage_tier,
      dressing_room_role: record.dressing_room_role,
      injury_risk: record.injury_risk,
      leadership_value: record.leadership_value,
      academy_pathway_value: record.academy_pathway_value,
      minutes_expectation: record.minutes_expectation,
      tactical_role: record.tactical_role,
      source_label: record.source_label,
      source_note: record.source_note,
      foot: record.foot ?? null,
      season_baseline: bayernFallbackResearchBaseline,
    },
    last_synced_at: syncedAt,
    bayern_category: record.category,
    player_importance: record.player_importance,
    fan_importance: record.fan_importance,
    board_sale_stance: record.board_sale_stance,
    wage_tier: record.wage_tier,
    dressing_room_role: record.dressing_room_role,
    injury_risk: record.injury_risk,
    leadership_value: record.leadership_value,
    academy_pathway_value: record.academy_pathway_value,
    contract_years_left: contractYearsLeft(record.contract),
    minutes_expectation: record.minutes_expectation,
    transfer_value_min_eur_m: minValue,
    transfer_value_max_eur_m: maxValue,
    wage_pressure_note: `Estimated wage tier: ${record.wage_tier}.`,
    traits: [],
    personality_note: record.notes,
    foot: record.foot ?? null,
    tactical_role: record.tactical_role,
    source_label: record.source_label,
    source_note: record.source_note,
  };
}

export const fallbackBayernPlayers: PlayerRecord[] = bayernFallbackResearchPlayers.map(toPlayer);

function contractYearsLeft(contract: string) {
  const match = contract.match(/(\d{4})/);
  if (!match) return null;
  const endYear = Number(match[1]);
  if (!Number.isFinite(endYear)) return null;
  return Math.max(0, endYear - 2026);
}

export function shouldUseCuratedFallback(store: Store) {
  const bayernClub = store.clubs.find((club) => /bayern/i.test(club.name)) ?? null;
  const sourcesNeedFallback = store.data_sources.some((source) => source.health_status !== "healthy");
  const liveBayernPlayers = bayernClub
    ? store.players.filter((player) => player.current_club_id === bayernClub.id && player.external_source !== "manual")
    : [];

  if (!bayernClub) return true;
  if (sourcesNeedFallback) return true;
  if (liveBayernPlayers.length < fallbackBayernPlayers.length) return true;
  const liveWithGaps = liveBayernPlayers.filter((player) => {
    const missingEssential = !player.position || player.age === null || !player.shirt_number;
    const missingProfile = !player.player_importance || !player.wage_tier || !player.dressing_room_role;
    return missingEssential || missingProfile;
  });
  return liveWithGaps.length > 0;
}
