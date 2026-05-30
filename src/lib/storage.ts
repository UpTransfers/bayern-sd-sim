import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ClubRecord,
  DataSourceRecord,
  DecisionFeedItem,
  MatchRecord,
  PlayerRecord,
  Simulation,
  SimulationLineup,
  SimulationPlayerDecision,
  SimulationResult,
  SimulationSigning,
  StandingRecord,
  Store,
  SyncRun,
} from "./types";
import { fallbackBayernClub, fallbackBayernPlayers } from "./data/fallback";
import { defaultTactics, normalizeTactics } from "./simulation/tactics";

const storePath = path.join(process.cwd(), "data", "sim-store.json");

const defaultDataSources: DataSourceRecord[] = [
  {
    id: "openligadb",
    source_name: "openligadb",
    source_url: "https://openligadb.de/",
    license_or_terms_note: "ODbL / community open sports data",
    enabled: true,
    last_checked_at: null,
    health_status: "disabled",
    error_message: null,
  },
  {
    id: "football-data",
    source_name: "football-data",
    source_url: "https://www.football-data.org/",
    license_or_terms_note: "Free tier requires API key",
    enabled: Boolean(process.env.FOOTBALL_DATA_API_KEY),
    last_checked_at: null,
    health_status: process.env.FOOTBALL_DATA_API_KEY ? "degraded" : "disabled",
    error_message: process.env.FOOTBALL_DATA_API_KEY ? null : "football-data.org API key missing.",
  },
  {
    id: "thesportsdb",
    source_name: "thesportsdb",
    source_url: "https://www.thesportsdb.com/",
    license_or_terms_note: "Free access subject to source terms",
    enabled: Boolean(process.env.THESPORTSDB_API_KEY),
    last_checked_at: null,
    health_status: process.env.THESPORTSDB_API_KEY ? "degraded" : "disabled",
    error_message: process.env.THESPORTSDB_API_KEY ? null : "TheSportsDB API key missing.",
  },
  {
    id: "wikidata",
    source_name: "wikidata",
    source_url: "https://query.wikidata.org/",
    license_or_terms_note: "CC0 data",
    enabled: true,
    last_checked_at: null,
    health_status: "degraded",
    error_message: null,
  },
];

function now() {
  return new Date().toISOString();
}

function emptyStore(): Store {
  return {
    users: [],
    simulations: [],
    data_sources: structuredClone(defaultDataSources),
    sync_runs: [],
    clubs: [],
    players: [],
    matches: [],
    standings: [],
    simulation_player_decisions: [],
    simulation_signings: [],
    simulation_lineups: [],
    simulation_results: [],
    decision_feed: [],
  };
}

export function ensureFallbackBayernData(store: Store) {
  const hasBayernClub = store.clubs.some((club) => /bayern/i.test(club.name));
  if (!hasBayernClub) {
    store.clubs.push(fallbackBayernClub);
  }

  const bayernClub =
    store.clubs.find((club) => club.external_id === fallbackBayernClub.external_id) ??
    store.clubs.find((club) => /bayern/i.test(club.name)) ??
    fallbackBayernClub;

  const allowedIds = new Set(fallbackBayernPlayers.map((player) => player.external_id));
  const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");

  store.players = store.players.filter((player) => {
    if (player.external_source !== "manual") return true;
    if (!player.external_id.startsWith("manual-")) return true;
    return allowedIds.has(player.external_id);
  });

  for (const fallbackPlayer of fallbackBayernPlayers) {
    const existing = store.players.find(
      (player) =>
        player.external_source === fallbackPlayer.external_source &&
        player.external_id === fallbackPlayer.external_id,
    );
    const existingByName = store.players.find(
      (player) =>
        normalize(player.name) === normalize(fallbackPlayer.name) &&
        (/bayern/i.test(player.current_club_id ?? "") || /bayern/i.test(player.name)),
    );
    const target = existing ?? existingByName ?? null;
    if (target) {
      if (target.external_source !== "manual" || target.external_id !== fallbackPlayer.external_id) {
        target.external_source = "manual";
        target.external_id = fallbackPlayer.external_id;
      }
      Object.assign(target, { ...fallbackPlayer, current_club_id: bayernClub.id });
      continue;
    }
    store.players.push({ ...fallbackPlayer, current_club_id: bayernClub.id });
  }
}

async function ensureStoreFile() {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
}

let writeChain = Promise.resolve();

export async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return {
      ...emptyStore(),
      ...parsed,
      simulations: parsed.simulations?.map((simulation) => ({
        ...simulation,
        tactics_json: normalizeTactics(simulation.tactics_json ?? defaultTactics),
        set_pieces_json: simulation.set_pieces_json ?? null,
      })) ?? [],
      data_sources: parsed.data_sources?.length ? parsed.data_sources : structuredClone(defaultDataSources),
    };
  } catch {
    return emptyStore();
  }
}

export async function writeStore(store: Store) {
  await ensureStoreFile();
  // Windows can reject temp-file rename swaps when the target is being read rapidly.
  // Writing directly keeps the local sim store stable under repeated simulation runs.
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function mutateStore(mutator: (store: Store) => void | Promise<void>) {
  const next = writeChain.then(async () => {
    const store = await readStore();
    await mutator(store);
    await writeStore(store);
    return store;
  });
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function makeId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export async function createSimulationRecord(input: {
  directorName: string;
  selectedBudgetEur: number;
  seasonLabel: string;
}) {
  const createdAt = now();
  const simulation: Simulation = {
    id: makeId("sim"),
    user_id: null,
    director_name: input.directorName,
    selected_budget_eur: input.selectedBudgetEur,
    remaining_budget_eur: input.selectedBudgetEur,
    season_label: input.seasonLabel,
    status: "draft",
    board_confidence: 52,
    fan_confidence: 50,
    data_confidence: 0,
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: null,
    formation: null,
    tactics_json: defaultTactics,
    set_pieces_json: null,
    completed_tasks: [],
    current_task: null,
    notes: null,
  };

  await mutateStore((store) => {
    ensureFallbackBayernData(store);
    store.simulations.unshift(simulation);
  });

  return simulation;
}

export async function ensureSimulationRecord(simulationId: string) {
  const createdAt = now();
  let simulation: Simulation | null = null;
  await mutateStore((store) => {
    ensureFallbackBayernData(store);
    simulation = store.simulations.find((item) => item.id === simulationId) ?? null;
    if (simulation) return;

    simulation = {
      id: simulationId,
      user_id: null,
      director_name: "Sporting Director",
      selected_budget_eur: 200,
      remaining_budget_eur: 200,
      season_label: "2026-27 Planning",
      status: "draft",
      board_confidence: 52,
      fan_confidence: 50,
      data_confidence: 0,
      created_at: createdAt,
      updated_at: createdAt,
      completed_at: null,
      formation: null,
      tactics_json: defaultTactics,
      set_pieces_json: null,
      completed_tasks: [],
      current_task: null,
      notes: "Auto-recovered local testing simulation.",
    };
    store.simulations.unshift(simulation);
  });
  return simulation;
}

export async function updateSimulationRecord(
  simulationId: string,
  patch: Partial<Simulation>,
) {
  return mutateStore((store) => {
    const existing = store.simulations.find((item) => item.id === simulationId);
    if (!existing) {
      return;
    }
    Object.assign(existing, patch, { updated_at: now() });
  });
}

export async function getSimulation(simulationId: string) {
  const store = await readStore();
  return store.simulations.find((item) => item.id === simulationId) ?? null;
}

export async function upsertClub(record: ClubRecord) {
  return mutateStore((store) => {
    const index = store.clubs.findIndex(
      (item) =>
        item.external_source === record.external_source &&
        item.external_id === record.external_id,
    );
    if (index >= 0) store.clubs[index] = record;
    else store.clubs.push(record);
  });
}

export async function upsertPlayer(record: PlayerRecord) {
  return mutateStore((store) => {
    const index = store.players.findIndex(
      (item) =>
        item.external_source === record.external_source &&
        item.external_id === record.external_id,
    );
    if (index >= 0) store.players[index] = record;
    else store.players.push(record);
  });
}

export async function upsertMatch(record: MatchRecord) {
  return mutateStore((store) => {
    const index = store.matches.findIndex(
      (item) =>
        item.external_source === record.external_source &&
        item.external_id === record.external_id,
    );
    if (index >= 0) store.matches[index] = record;
    else store.matches.push(record);
  });
}

export async function upsertStanding(record: StandingRecord) {
  return mutateStore((store) => {
    const index = store.standings.findIndex(
      (item) =>
        item.external_source === record.external_source &&
        item.competition === record.competition &&
        item.season === record.season &&
        item.club_name === record.club_name,
    );
    if (index >= 0) store.standings[index] = record;
    else store.standings.push(record);
  });
}

export async function addDecisionFeed(item: DecisionFeedItem) {
  return mutateStore((store) => {
    store.decision_feed.unshift(item);
  });
}

export async function addPlayerDecision(record: SimulationPlayerDecision) {
  return mutateStore((store) => {
    store.simulation_player_decisions.push(record);
  });
}

export async function addSigning(record: SimulationSigning) {
  return mutateStore((store) => {
    store.simulation_signings.push(record);
  });
}

export async function addLineup(record: SimulationLineup) {
  return mutateStore((store) => {
    store.simulation_lineups.push(record);
  });
}

export async function addResult(record: SimulationResult) {
  return mutateStore((store) => {
    store.simulation_results.push(record);
  });
}

export async function updateSourceHealth(
  sourceName: string,
  patch: Partial<DataSourceRecord>,
) {
  return mutateStore((store) => {
    const source = store.data_sources.find((item) => item.source_name === sourceName);
    if (!source) return;
    Object.assign(source, patch);
  });
}

export async function addSyncRun(record: SyncRun) {
  return mutateStore((store) => {
    store.sync_runs.unshift(record);
  });
}

export async function findClubByName(name: string) {
  const store = await readStore();
  return store.clubs.find((club) => club.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export async function getStoreSnapshot() {
  return readStore();
}
