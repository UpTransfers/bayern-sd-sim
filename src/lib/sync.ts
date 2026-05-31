import { randomUUID } from "node:crypto";
import { env } from "./env";
import { fetchOpenLigaMatches, fetchOpenLigaTable } from "./api/openligadb";
import { fetchBayernClubFromWikidata, searchWikidataPlayers } from "./api/wikidata";
import { fetchFootballDataCompetition, fetchFootballDataMatches, fetchFootballDataTeams } from "./api/footballData";
import { searchTheSportsDbTeamPlayers } from "./api/theSportsDB";
import {
  addSyncRun,
  getStoreSnapshot,
  updateSourceHealth,
  upsertClub,
  upsertMatch,
  upsertPlayer,
  upsertStanding,
} from "./storage";
import { currentSeasonStartYear, seasonLabelFromYear } from "./simulation/service";
import { buildSimulationSummary } from "./simulation/service";
import { normalizeClub, normalizeMatch, normalizePlayer, normalizeStanding } from "./football/normalize";
import { calculateConfidence } from "./football/confidence";
import { bayernTransferCandidates } from "./data/bayern2026";
import { classifyWageConcern, lookupTransferMarketIntel } from "./data/transferMarketIntel";
import { evaluateBayernTransferApproval } from "./football/approval";
import { deriveCatalogPlayerProfile, deriveTransferCandidateProfile } from "./football/playerModel";
import { defaultTactics } from "./simulation/tactics";
import type { SimulationSummary } from "./types";

function now() {
  return new Date().toISOString();
}

export async function syncOpenLigaDB() {
  const startedAt = now();
  const syncId = `sync_${randomUUID()}`;
  await addSyncRun({
    id: syncId,
    source_name: "openligadb",
    endpoint: "getbltable/bl1 and getmatchdata/bl1",
    status: "running",
    started_at: startedAt,
    finished_at: null,
    records_inserted: 0,
    records_updated: 0,
    error_message: null,
  });

  try {
    const seasonStartYear = currentSeasonStartYear();
    const [table, matches] = await Promise.all([
      fetchOpenLigaTable(seasonStartYear),
      fetchOpenLigaMatches(seasonStartYear),
    ]);

    let recordsInserted = 0;
    for (const row of table.table) {
      await upsertStanding(
        normalizeStanding({
          externalSource: "openligadb",
          competition: "Bundesliga",
          season: seasonLabelFromYear(seasonStartYear),
          clubName: row.clubName || "Unknown club",
          position: row.position,
          played: row.played,
          won: row.won,
          drawn: row.drawn,
          lost: row.lost,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          points: row.points,
          rawJson: row.raw,
        }),
      );
      recordsInserted += 1;
    }

    for (const match of matches.matches) {
      await upsertMatch(
        normalizeMatch({
          externalSource: "openligadb",
          externalId: match.externalId,
          competition: match.competition,
          season: match.season,
          matchday: match.matchday,
          utcDate: match.utcDate,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          status: match.status,
          rawJson: match.raw,
        }),
      );
      recordsInserted += 1;
    }

    await updateSourceHealth("openligadb", {
      last_checked_at: now(),
      health_status: "healthy",
      error_message: null,
    });
    await addSyncRun({
      id: syncId,
      source_name: "openligadb",
      endpoint: "getbltable/bl1 and getmatchdata/bl1",
      status: "success",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: recordsInserted,
      records_updated: 0,
      error_message: null,
    });

    return { ok: true, source: "openligadb", recordsInserted, seasonStartYear };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenLigaDB error";
    await updateSourceHealth("openligadb", {
      last_checked_at: now(),
      health_status: "error",
      error_message: message,
    });
    await addSyncRun({
      id: syncId,
      source_name: "openligadb",
      endpoint: "getbltable/bl1 and getmatchdata/bl1",
      status: "error",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: 0,
      records_updated: 0,
      error_message: message,
    });
    return { ok: false, source: "openligadb", error: message };
  }
}

export async function syncWikidata() {
  const startedAt = now();
  const syncId = `sync_${randomUUID()}`;
  await addSyncRun({
    id: syncId,
    source_name: "wikidata",
    endpoint: "Bayern club + squad SPARQL",
    status: "running",
    started_at: startedAt,
    finished_at: null,
    records_inserted: 0,
    records_updated: 0,
    error_message: null,
  });

  try {
    const clubData = await fetchBayernClubFromWikidata();
    const club = normalizeClub({
      externalSource: "wikidata",
      externalId: clubData.externalId,
      name: clubData.name,
      shortName: "Bayern",
      country: clubData.country,
      venue: clubData.venue,
      founded: clubData.founded,
      rawJson: clubData.raw,
    });
    await upsertClub(club);

    const recordsInserted = 1;

    await updateSourceHealth("wikidata", {
      last_checked_at: now(),
      health_status: "healthy",
      error_message: null,
    });
    await addSyncRun({
      id: syncId,
      source_name: "wikidata",
      endpoint: "Bayern club + squad SPARQL",
      status: "success",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: recordsInserted,
      records_updated: 0,
      error_message: null,
    });
    return {
      ok: true,
      source: "wikidata",
      club: club.name,
      squadSize: 0,
      note: "Club metadata synced. Squad uses curated fallback because Wikidata P54 includes historical Bayern players.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Wikidata error";
    await updateSourceHealth("wikidata", {
      last_checked_at: now(),
      health_status: "error",
      error_message: message,
    });
    await addSyncRun({
      id: syncId,
      source_name: "wikidata",
      endpoint: "Bayern club + squad SPARQL",
      status: "error",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: 0,
      records_updated: 0,
      error_message: message,
    });
    return { ok: false, source: "wikidata", error: message };
  }
}

export async function syncFootballData() {
  const startedAt = now();
  const syncId = `sync_${randomUUID()}`;
  await addSyncRun({
    id: syncId,
    source_name: "football-data",
    endpoint: "competitions/BL1",
    status: "running",
    started_at: startedAt,
    finished_at: null,
    records_inserted: 0,
    records_updated: 0,
    error_message: null,
  });

  if (!env.footballDataApiKey) {
    const message = "football-data.org API key missing.";
    await updateSourceHealth("football-data", {
      last_checked_at: now(),
      health_status: "disabled",
      error_message: message,
    });
    await addSyncRun({
      id: syncId,
      source_name: "football-data",
      endpoint: "competitions/BL1",
      status: "partial",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: 0,
      records_updated: 0,
      error_message: message,
    });
    return { ok: false, source: "football-data", error: message };
  }

  try {
    const competition = await fetchFootballDataCompetition();
    const teams = await fetchFootballDataTeams();
    const matches = await fetchFootballDataMatches();
    let recordsInserted = 0;

    if (competition.available) {
      const comp = competition.data as Record<string, unknown>;
      await upsertClub(
        normalizeClub({
          externalSource: "football-data",
          externalId: String(comp.code ?? "BL1"),
          name: String(comp.name ?? "Bundesliga"),
          country: String((comp.area as Record<string, unknown> | undefined)?.name ?? "Germany"),
          rawJson: competition.raw,
        }),
      );
      recordsInserted += 1;
    }

    if (teams.available) {
      const data = teams.data as Record<string, unknown>;
      const teamsList = Array.isArray(data.teams) ? data.teams : [];
      for (const team of teamsList) {
        const record = team as Record<string, unknown>;
        const name = String(record.name ?? record.shortName ?? "");
        if (!name) continue;
        await upsertClub(
          normalizeClub({
            externalSource: "football-data",
            externalId: String(record.id ?? name),
            name,
            shortName: String(record.shortName ?? name),
            country: String((record.area as Record<string, unknown> | undefined)?.name ?? "Germany"),
            crestUrl: String(record.crest ?? "") || null,
            rawJson: record,
          }),
        );
        recordsInserted += 1;
      }
    }

    if (matches.available) {
      const data = matches.data as Record<string, unknown>;
      const matchList = Array.isArray(data.matches) ? data.matches : [];
      for (const match of matchList.slice(0, 60)) {
        const item = match as Record<string, unknown>;
        const score = item.score as Record<string, unknown> | undefined;
        const fullTime = score?.fullTime as Record<string, unknown> | undefined;
        await upsertMatch(
          normalizeMatch({
            externalSource: "football-data",
            externalId: String(item.id ?? randomUUID()),
            competition: String((data.competition as Record<string, unknown> | undefined)?.name ?? "Bundesliga"),
            season: seasonLabelFromYear(currentSeasonStartYear()),
            matchday: Number(item.matchday ?? 0) || null,
            utcDate: String(item.utcDate ?? null) || null,
            homeTeam: String((item.homeTeam as Record<string, unknown> | undefined)?.name ?? ""),
            awayTeam: String((item.awayTeam as Record<string, unknown> | undefined)?.name ?? ""),
            homeScore: fullTime && fullTime.home !== undefined ? Number(fullTime.home) : null,
            awayScore: fullTime && fullTime.away !== undefined ? Number(fullTime.away) : null,
            status: String(item.status ?? "UNKNOWN"),
            rawJson: item,
          }),
        );
        recordsInserted += 1;
      }
    }

    await updateSourceHealth("football-data", {
      last_checked_at: now(),
      health_status: "healthy",
      error_message: null,
    });
    await addSyncRun({
      id: syncId,
      source_name: "football-data",
      endpoint: "competitions/BL1",
      status: "success",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: recordsInserted,
      records_updated: 0,
      error_message: null,
    });
    return { ok: true, source: "football-data", recordsInserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown football-data error";
    await updateSourceHealth("football-data", {
      last_checked_at: now(),
      health_status: "error",
      error_message: message,
    });
    await addSyncRun({
      id: syncId,
      source_name: "football-data",
      endpoint: "competitions/BL1",
      status: "error",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: 0,
      records_updated: 0,
      error_message: message,
    });
    return { ok: false, source: "football-data", error: message };
  }
}

export async function syncTheSportsDB() {
  const startedAt = now();
  const syncId = `sync_${randomUUID()}`;
  await addSyncRun({
    id: syncId,
    source_name: "thesportsdb",
    endpoint: "searchplayers.php?t=FC Bayern",
    status: "running",
    started_at: startedAt,
    finished_at: null,
    records_inserted: 0,
    records_updated: 0,
    error_message: null,
  });

  if (!env.theSportsDbApiKey) {
    const message = "TheSportsDB API key missing.";
    await updateSourceHealth("thesportsdb", {
      last_checked_at: now(),
      health_status: "disabled",
      error_message: message,
    });
    await addSyncRun({
      id: syncId,
      source_name: "thesportsdb",
      endpoint: "searchplayers.php?t=FC Bayern",
      status: "partial",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: 0,
      records_updated: 0,
      error_message: message,
    });
    return { ok: false, source: "thesportsdb", error: message };
  }

  try {
    const response = await searchTheSportsDbTeamPlayers("FC Bayern Munich");
    let recordsInserted = 0;
    if (response.available) {
      const data = response.data as Record<string, unknown>;
      const players = Array.isArray(data.player) ? data.player : Array.isArray(data.players) ? data.players : [];
      const store = await getStoreSnapshot();
      const club = store.clubs.find((item) => /bayern/i.test(item.name)) ?? null;
      for (const player of players.slice(0, 30)) {
        const record = player as Record<string, unknown>;
        await upsertPlayer(
          normalizePlayer({
            externalSource: "thesportsdb",
            externalId: String(record.idPlayer ?? randomUUID()),
            name: String(record.strPlayer ?? "Unnamed player"),
            dateOfBirth: String(record.dateBorn ?? "") || null,
            nationality: String(record.strNationality ?? "") || null,
            position: String(record.strPosition ?? "") || null,
            shirtNumber: String(record.strNumber ?? "") || null,
            currentClubId: club?.id ?? null,
            photoUrl: String(record.strThumb ?? "") || null,
            rawJson: record,
          }),
        );
        recordsInserted += 1;
      }
    }

    await updateSourceHealth("thesportsdb", {
      last_checked_at: now(),
      health_status: "healthy",
      error_message: null,
    });
    await addSyncRun({
      id: syncId,
      source_name: "thesportsdb",
      endpoint: "searchplayers.php?t=FC Bayern",
      status: "success",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: recordsInserted,
      records_updated: 0,
      error_message: null,
    });
    return { ok: true, source: "thesportsdb", recordsInserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown TheSportsDB error";
    await updateSourceHealth("thesportsdb", {
      last_checked_at: now(),
      health_status: "error",
      error_message: message,
    });
    await addSyncRun({
      id: syncId,
      source_name: "thesportsdb",
      endpoint: "searchplayers.php?t=FC Bayern",
      status: "error",
      started_at: startedAt,
      finished_at: now(),
      records_inserted: 0,
      records_updated: 0,
      error_message: message,
    });
    return { ok: false, source: "thesportsdb", error: message };
  }
}

export async function searchPlayersAcrossSources(query: string, simulationId?: string | null) {
  const store = await getStoreSnapshot();
  const summary = simulationId ? await buildSimulationSummary(simulationId) : null;
  const ownedNames = new Set<string>();
  const ownedIds = new Set<string>();
  for (const entry of summary?.activeRoster ?? []) {
    ownedNames.add(entry.player.name.trim().toLowerCase());
    ownedIds.add(entry.id);
  }
  for (const signing of summary?.signings ?? []) {
    ownedNames.add(signing.player_name.trim().toLowerCase());
    const rawId = signing.player_external_id.trim().toLowerCase();
    ownedIds.add(rawId);
    if (rawId.startsWith("market:")) {
      ownedIds.add(rawId.slice("market:".length));
    } else {
      ownedIds.add(`market:${rawId}`);
    }
  }
  const baseSummary = {
    simulation: {
      id: "approval-scout",
      user_id: null,
      director_name: "Scout Desk",
      selected_budget_eur: 200,
      remaining_budget_eur: 200,
      season_label: "2026-27 Planning",
      status: "draft",
      board_confidence: 62,
      fan_confidence: 60,
      data_confidence: 70,
      created_at: now(),
      updated_at: now(),
      completed_at: null,
      formation: "4-2-3-1",
      tactics_json: defaultTactics,
      set_pieces_json: null,
      completed_tasks: [],
      current_task: null,
      notes: null,
    },
    club: store.clubs.find((club) => /bayern/i.test(club.name)) ?? null,
    currentStanding: store.standings.find((standing) => /bayern/i.test(standing.club_name)) ?? null,
    recentMatches: store.matches.filter((match) => /bayern/i.test(match.home_team) || /bayern/i.test(match.away_team)).slice(0, 8),
    sourceHealth: store.data_sources,
    activeRoster: store.players
      .filter((player) => player.bayern_category === "first_team")
      .map((player) => ({ kind: "catalog" as const, id: player.id, player, isSigned: false })),
    sellRoster: store.players
      .filter((player) => player.bayern_category === "first_team" || player.bayern_category === "loan_return" || player.bayern_category === "youth")
      .map((player) => ({ kind: "catalog" as const, id: player.id, player, isSigned: false })),
    loanReturnPool: store.players.filter((player) => player.bayern_category === "loan_return"),
    youthProspects: store.players.filter((player) => player.bayern_category === "youth"),
    soldPlayerIds: [],
    loanedPlayerIds: [],
    decisions: [],
    signings: [],
    lineup: null,
    result: null,
    feed: [],
  } as SimulationSummary;
  const approvalSummary = summary ?? baseSummary;

  const results: Array<{
    id: string;
    name: string;
    club: string | null;
    shirtNumber: number | null;
    position: string | null;
    nationality: string | null;
    currentClub: string | null;
    age: number | null;
    fee: number;
    fit: number;
    need: number;
    source: string;
    confidence: number;
    lowConfidence: boolean;
    foot?: string | null;
    contract?: string | null;
    ability?: number | null;
    bayernFit?: number | null;
    keyTraits?: string[];
    inPossessionFit?: string | null;
    outOfPossessionFit?: string | null;
      characterNote?: string | null;
      realism?: string | null;
      verdict?: string | null;
      currentWage?: string | null;
      bayernDemand?: string | null;
      wageConcern?: "Low" | "Medium" | "High" | "Very High";
      approval?: ReturnType<typeof evaluateBayernTransferApproval>;
      raw: unknown;
    }> = [];

  const normalizedQuery = query.trim().toLowerCase();
  const marketMatches = bayernTransferCandidates
    .filter((player) => {
      const playerNameKey = player.name.trim().toLowerCase();
      const playerIdKey = player.id.trim().toLowerCase();
      const marketIdKey = `market:${playerIdKey}`;
      if (simulationId && (ownedNames.has(playerNameKey) || ownedIds.has(playerIdKey) || ownedIds.has(marketIdKey))) return false;
      if (!normalizedQuery) return true;
      return [player.name, player.position, player.nationality, player.club, player.verdict, player.characterNote, ...player.keyTraits]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    })
    .map((player) => {
      const profile = deriveTransferCandidateProfile(player);
      const intel = lookupTransferMarketIntel(player.name);
      const need = player.need ?? intel?.need ?? Math.round(player.bayernFit * 9 + (player.ability - 7) * 4);
      const wageConcern = player.wageConcern ?? classifyWageConcern(intel);
      const approvalPlayer = {
        ...player,
        need,
        currentWage: intel?.currentWage ?? player.currentWage,
        bayernDemand: intel?.bayernDemand ?? player.bayernDemand,
        wageConcern,
      };
      return {
      id: `market:${player.id}`,
      name: player.name,
      club: player.club,
      shirtNumber: player.shirtNumber,
      position: player.position,
      nationality: player.nationality,
      currentClub: player.club,
      age: Math.round((player.ageMin + player.ageMax) / 2),
      fee: Math.round((player.fee.min + player.fee.max) / 2),
      fit: player.bayernFit * 10,
      need,
      source: "bayern-market",
      confidence: player.ability * 10,
      lowConfidence: player.realism !== "Realistic",
      foot: player.foot,
      contract: player.contract,
      ability: player.ability,
      bayernFit: player.bayernFit,
      rating: profile.rating,
      form: profile.form,
      keyTraits: player.keyTraits,
      inPossessionFit: player.inPossessionFit,
      outOfPossessionFit: player.outOfPossessionFit,
      characterNote: player.characterNote,
      realism: player.realism,
      verdict: player.verdict,
      currentWage: intel?.currentWage ?? null,
      bayernDemand: intel?.bayernDemand ?? null,
      wageConcern,
      approval: evaluateBayernTransferApproval(approvalPlayer, approvalSummary),
      raw: player,
      };
    });

  results.push(...marketMatches);

  if (query.trim()) {
    let wikidata;
    try {
      wikidata = await Promise.race([
        searchWikidataPlayers(query),
        new Promise<{ results: [] }>((resolve) => setTimeout(() => resolve({ results: [] }), 1_800)),
      ]);
    } catch {
      wikidata = { results: [] };
    }
    for (const player of wikidata.results.slice(0, 10)) {
      const age = player.dateOfBirth
        ? Math.max(0, Math.floor((Date.now() - new Date(player.dateOfBirth).getTime()) / 31_556_952_000))
        : null;
      const confidence = calculateConfidence({
        dateOfBirth: player.dateOfBirth,
        nationality: player.nationality,
        position: player.position,
        shirtNumber: player.shirtNumber,
        photoUrl: player.photoUrl,
        currentClubId: player.currentClub ?? null,
      });
      const fee = Math.round(
        Math.max(
          2,
          8 +
            (player.position?.match(/forward|wing|striker/i) ? 10 : player.position?.match(/midfielder/i) ? 8 : 6) +
            (age && age <= 23 ? 8 : age && age <= 27 ? 4 : 0) +
            confidence / 10,
        ),
      );
      results.push({
        id: `wikidata:${player.externalId}`,
        name: player.name,
        club: player.currentClub ?? null,
        shirtNumber: player.shirtNumber ? Number(player.shirtNumber) : null,
        position: player.position,
        nationality: player.nationality,
        currentClub: player.currentClub,
        age,
        fee,
        fit: confidence,
        need: player.position?.match(/goalkeeper/i) ? 60 : player.position?.match(/defender/i) ? 68 : player.position?.match(/midfielder/i) ? 75 : 82,
        source: "wikidata",
        confidence,
        lowConfidence: confidence < 60,
        foot: null,
        contract: null,
        ability: null,
        bayernFit: null,
        keyTraits: [],
        inPossessionFit: null,
        outOfPossessionFit: null,
        characterNote: "Live Wikidata fallback result.",
        realism: "Unknown",
        verdict: null,
        approval: undefined,
        raw: player.raw,
      });
    }
  }

  const catalogMatches = normalizedQuery
    ? store.players
        .filter((player) => player.name.toLowerCase().includes(normalizedQuery))
        .filter((player) => !simulationId || (!ownedNames.has(player.name.trim().toLowerCase()) && !ownedIds.has(player.id.toLowerCase())))
    .slice(0, 8)
    .map((player) => {
      const profile = deriveCatalogPlayerProfile(player);
      return {
      id: player.id,
      name: player.name,
      club: store.clubs.find((club) => club.id === player.current_club_id)?.name ?? null,
      shirtNumber: player.shirt_number ? Number(player.shirt_number) : null,
      position: player.position,
      nationality: player.nationality,
      currentClub: store.clubs.find((club) => club.id === player.current_club_id)?.name ?? "FC Bayern Munich",
      age: player.age,
      fee: Math.max(2, Math.round(estimateFeeFromCatalog(player))),
      fit: player.data_confidence,
      need: player.position?.match(/goalkeeper/i) ? 60 : player.position?.match(/defender/i) ? 68 : 80,
      source: player.external_source,
      confidence: player.data_confidence,
      lowConfidence: player.data_confidence < 60,
      foot: player.foot ?? null,
      contract: null,
      ability: Math.round(profile.rating / 10),
      bayernFit: player.bayern_fit_score ?? null,
      rating: profile.rating,
      form: profile.form,
      keyTraits: player.traits ?? [],
      inPossessionFit: null,
      outOfPossessionFit: null,
      characterNote: player.personality_note ?? null,
      realism: null,
      verdict: null,
      approval: undefined,
      raw: player.raw_json,
      };
    })
    : [];

  const seen = new Set<string>();
  return [...results, ...catalogMatches]
    .filter((player) => {
      const key = player.name.toLowerCase();
      if (simulationId && ownedNames.has(key)) return false;
      if (simulationId && ownedIds.has(player.id.trim().toLowerCase())) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function estimateFeeFromCatalog(player: { age: number | null; position: string | null; data_confidence: number }) {
  const age = player.age ?? 25;
  const base = player.position?.match(/forward|wing/i) ? 18 : player.position?.match(/midfielder/i) ? 14 : 11;
  return base + Math.max(0, 27 - age) * 0.8 + player.data_confidence / 12;
}
