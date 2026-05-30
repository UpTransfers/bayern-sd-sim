import type {
  ClubRecord,
  DecisionFeedItem,
  PlayerRecord,
  SimulationPlayerDecision,
  SimulationResult,
  SimulationRosterEntry,
  SimulationSigning,
  SimulationSummary,
  Store,
  TaskId,
} from "../types";
import { dataCoverageScore } from "../football/confidence";
import { boardObjectives, computeBoardConfidence } from "../football/board";
import {
  budgetEfficiencyScore,
  injuryVulnerabilityScore,
  mediaPressureScore,
  squadBalanceScore,
  tacticalFitScore,
} from "../football/scoring";
import { projectedFinish, projectedPoints, verdictFromProjection } from "../football/projection";
import { clamp, ordinal, stableId } from "../utils";
import { addDecisionFeed, addResult, ensureFallbackBayernData, getStoreSnapshot, mutateStore, updateSimulationRecord } from "../storage";
import { computeFanConfidence } from "../football/fanConfidence";
import { normalizeTactics, tacticalImpact } from "../simulation/tactics";
import { pokalModel, uclTitleModel } from "../data/bayern2026";
import { deriveRosterEntryProfile, deriveTransferCandidateProfile } from "../football/playerModel";
import { analyzeBayernLineup, slotFitScore } from "../football/lineupImpact";
import { buildBayernSetPiecePlan } from "../football/setPieces";
import { formationSlots } from "./formations";
import { simulateBundesligaSeason, simulatePokalOutcome, simulateUclOutcome } from "./league";

export function currentSeasonStartYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return month >= 6 ? year : year - 1;
}

export function seasonLabelFromYear(startYear: number) {
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function defaultFormation() {
  return "4-2-3-1";
}

export function getBayernClub(store: Store): ClubRecord | null {
  return (
    store.clubs.find((club) => club.external_source === "manual" && club.external_id === "manual-bayern-munich") ??
    store.clubs.find((club) => club.external_id === "Q15789") ??
    store.clubs.find((club) => /bayern/i.test(club.name)) ??
    null
  );
}

export function getBayernPlayers(store: Store, clubId: string | null) {
  const firstTeam = store.players.filter((player) => player.bayern_category === "first_team");
  if (firstTeam.length) {
    return firstTeam;
  }

  return store.players.filter((player) => {
    if (clubId && player.current_club_id === clubId) return true;
    return /bayern/i.test(player.current_club_id ?? "");
  });
}

export function getBayernStanding(store: Store) {
  const candidates = store.standings.filter((standing) => /bayern/i.test(standing.club_name));
  return candidates.sort((a, b) => a.position - b.position)[0] ?? null;
}

export function getRecentBayernMatches(store: Store) {
  return [...store.matches]
    .filter((match) => /bayern/i.test(match.home_team) || /bayern/i.test(match.away_team))
    .sort((a, b) => new Date(b.utc_date ?? 0).getTime() - new Date(a.utc_date ?? 0).getTime())
    .slice(0, 8);
}

export function getLatestLineup(store: Store, simulationId: string) {
  return [...store.simulation_lineups]
    .filter((item) => item.simulation_id === simulationId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function getLatestResult(store: Store, simulationId: string) {
  return [...store.simulation_results]
    .filter((item) => item.simulation_id === simulationId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function getDecisions(store: Store, simulationId: string) {
  return store.simulation_player_decisions
    .filter((item) => item.simulation_id === simulationId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getSignings(store: Store, simulationId: string) {
  return store.simulation_signings
    .filter((item) => item.simulation_id === simulationId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getFeed(store: Store, simulationId: string) {
  return store.decision_feed
    .filter((item) => item.simulation_id === simulationId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function latestDecisionMap(decisions: SimulationPlayerDecision[]) {
  const map = new Map<string, SimulationPlayerDecision>();
  for (const decision of decisions) {
    map.set(decision.player_id, decision);
  }
  return map;
}

export function soldPlayerIds(decisions: SimulationPlayerDecision[]) {
  return [...latestDecisionMap(decisions).values()]
    .filter((item) => item.decision_type === "sell")
    .map((item) => item.player_id);
}

export function loanedPlayerIds(decisions: SimulationPlayerDecision[]) {
  return [...latestDecisionMap(decisions).values()]
    .filter((item) => item.decision_type === "loan")
    .map((item) => item.player_id);
}

export function keepPlayerIds(decisions: SimulationPlayerDecision[]) {
  return [...latestDecisionMap(decisions).values()]
    .filter((item) => item.decision_type === "keep")
    .map((item) => item.player_id);
}

export function buildRosterEntries(
  sourcePlayers: PlayerRecord[],
  signings: SimulationSigning[],
  decisions: SimulationPlayerDecision[],
  options?: { includeSignings?: boolean },
): SimulationRosterEntry[] {
  const includeSignings = options?.includeSignings ?? true;
  const latest = latestDecisionMap(decisions);
  const sourceEntries = sourcePlayers
    .filter((player) => {
      const decision = latest.get(player.id);
      return decision?.decision_type !== "sell" && decision?.decision_type !== "loan";
    })
    .map<SimulationRosterEntry>((player) => ({
      kind: "catalog",
      id: player.id,
      player,
      isSigned: false,
    }));

  const signingEntries = includeSignings
    ? signings.map<SimulationRosterEntry>((signing) => {
    const raw = signing.raw_json as
      | {
          age?: unknown;
          ability?: unknown;
          bayernFit?: unknown;
          foot?: unknown;
          keyTraits?: unknown;
          traits?: unknown;
          personalityNote?: unknown;
          fee?: unknown;
          rating?: unknown;
          form?: unknown;
        }
      | null;
    const age = typeof raw?.age === "number" ? raw.age : null;
    const rating =
      typeof raw?.rating === "number"
        ? raw.rating
        : typeof raw?.ability === "number"
          ? Math.round(raw.ability * 10)
          : null;
    const form =
      typeof raw?.form === "number"
        ? raw.form
        : typeof raw?.ability === "number"
          ? Math.round(raw.ability * 10 - 4)
          : null;
    return {
      kind: "signing",
      id: signing.id,
      player: {
        id: signing.id,
        name: signing.player_name,
        position: signing.position,
        nationality: signing.nationality,
        currentClub: signing.current_club,
        photo_url: null,
        age,
        rating,
        form,
        ability: typeof raw?.ability === "number" ? raw.ability : null,
        bayernFit: typeof raw?.bayernFit === "number" ? raw.bayernFit : null,
        fee: signing.fee_eur,
        foot: typeof raw?.foot === "string" ? raw.foot : null,
        traits: Array.isArray(raw?.traits)
          ? (raw?.traits as string[])
          : Array.isArray(raw?.keyTraits)
            ? (raw?.keyTraits as string[])
            : null,
        personalityNote: typeof raw?.personalityNote === "string" ? raw.personalityNote : null,
      },
      isSigned: true,
    };
  })
    : [];

  return uniqueRosterEntries([...sourceEntries, ...signingEntries]);
}

function uniqueRosterEntries(entries: SimulationRosterEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key =
      entry.kind === "catalog"
        ? `catalog:${normalizeRosterEntryKey(entry.player.name)}:${normalizeRosterEntryKey(entry.player.position ?? "")}:${entry.player.shirt_number ?? "na"}`
        : `signing:${normalizeRosterEntryKey(entry.player.name)}:${normalizeRosterEntryKey(entry.player.position ?? "")}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRosterEntryKey(value: string) {
  return value.trim().toLowerCase();
}

export function summarizePlayer(player: PlayerRecord) {
  return {
    id: player.id,
    name: player.name,
    age: player.age,
    nationality: player.nationality,
    position: player.position,
    shirt_number: player.shirt_number,
    confidence: player.data_confidence,
    photo_url: player.photo_url,
  };
}

export async function buildSimulationSummary(simulationId: string): Promise<SimulationSummary | null> {
  await mutateStore((store) => {
    ensureFallbackBayernData(store);
  });
  const store = await getStoreSnapshot();
  const simulation = store.simulations.find((item) => item.id === simulationId) ?? null;
  if (!simulation) return null;

  const club = getBayernClub(store);
  const standing = getBayernStanding(store);
  const recentMatches = getRecentBayernMatches(store);
  const decisions = getDecisions(store, simulationId);
  const signings = getSignings(store, simulationId);
  const lineup = getLatestLineup(store, simulationId);
  const result = getLatestResult(store, simulationId);
  const latestDecision = latestDecisionMap(decisions);
  const sourcePlayers = club ? getBayernPlayers(store, club.id) : store.players.filter((player) => /bayern/i.test(player.name));
  const promotedPlayers = store.players.filter((player) => {
    if (player.bayern_category !== "loan_return" && player.bayern_category !== "youth") return false;
    const decision = latestDecision.get(player.id)?.decision_type;
    return decision === "keep" || decision === "development";
  });
  const activeRoster = buildRosterEntries([...sourcePlayers, ...promotedPlayers], signings, decisions);
  const activeRosterIds = new Set(activeRoster.map((entry) => entry.id));
  const unresolvedDecisionTypes = new Set(["sell", "loan", "keep", "development"]);
  const loanReturnPool = store.players.filter(
    (player) => player.bayern_category === "loan_return" && !unresolvedDecisionTypes.has(latestDecision.get(player.id)?.decision_type ?? ""),
  );
  const youthProspects = store.players.filter(
    (player) => player.bayern_category === "youth" && !unresolvedDecisionTypes.has(latestDecision.get(player.id)?.decision_type ?? ""),
  );
  const sellRoster = buildRosterEntries([...sourcePlayers, ...promotedPlayers, ...loanReturnPool, ...youthProspects], signings, decisions, {
    includeSignings: false,
  });
  const feed = getFeed(store, simulationId);
  const sanitizedLineup =
    lineup && Array.isArray(lineup.lineup_json)
      ? {
          ...lineup,
          lineup_json: lineup.lineup_json.filter((item) => {
            const candidate = item as { playerId?: unknown };
            return typeof candidate.playerId === "string" && activeRosterIds.has(candidate.playerId);
          }),
        }
      : lineup;
  if (sanitizedLineup && Array.isArray(sanitizedLineup.lineup_json)) {
    sanitizedLineup.lineup_json = uniqueLineupEntries(sanitizedLineup.lineup_json as Array<{ slot?: unknown; playerId?: unknown }>);
  }

  return {
    simulation,
    club,
    currentStanding: standing,
    recentMatches,
    sourceHealth: store.data_sources,
    activeRoster,
    sellRoster,
    loanReturnPool,
    youthProspects,
    soldPlayerIds: soldPlayerIds(decisions),
    loanedPlayerIds: loanedPlayerIds(decisions),
    decisions,
    signings,
    lineup: sanitizedLineup,
    result,
    feed,
  };
}

function uniqueLineupEntries(items: Array<{ slot?: unknown; playerId?: unknown }>) {
  const seenSlots = new Set<string>();
  const seenPlayers = new Set<string>();
  return items.filter((item) => {
    if (typeof item.slot !== "string" || typeof item.playerId !== "string") return false;
    if (seenSlots.has(item.slot) || seenPlayers.has(item.playerId)) return false;
    seenSlots.add(item.slot);
    seenPlayers.add(item.playerId);
    return true;
  });
}

type SeasonAchievement = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
};

function bestBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce<T | null>((best, item) => {
    if (!best) return item;
    return score(item) > score(best) ? item : best;
  }, null);
}

function formatSignedGoalDiff(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatCupRound(outcome: { round: string; score: string; winner: string; opponent?: string | null }) {
  if (outcome.winner === "Bayern Munich") {
    return outcome.round === "Won"
      ? `won the competition (${outcome.score})`
      : `won in the ${outcome.round.toLowerCase()}${outcome.opponent ? ` vs ${outcome.opponent}` : ""} (${outcome.score})`;
  }
  return outcome.round === "League phase"
    ? `fell short in the league phase`
    : `lost to ${outcome.opponent ?? outcome.winner} in the ${outcome.round.toLowerCase()} (${outcome.score})`;
}

function buildAchievements(args: {
  leagueChampion: boolean;
  finishPoints: number;
  board: number;
  fan: number;
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number };
  trophies: string[];
  leagueRow: { gf: number; ga: number };
  signings: number;
  loans: number;
  sales: number;
  roi: number;
  pokalWon: boolean;
  uclWon: boolean;
  topPlayer: { name: string; age: number; rating: number; form: number } | null;
}): SeasonAchievement[] {
  const cleanSheetMachine = args.leagueRow.ga <= 30;
  const goalStorm = args.leagueRow.gf >= 100;
  const prestigeDouble = args.leagueChampion && args.pokalWon && !args.uclWon;
  const transferProfit = args.roi >= 0;
  const loanArmy = args.loans >= 3;
  const boardAnger = !args.leagueChampion && args.board < 55 && args.signings >= 4;
  const controlYear = args.finishPoints >= 80 && args.derived.tactical >= 72 && args.board >= 70;
  const trophyHaul = args.trophies.length >= 2;
  const youngStar = Boolean(args.topPlayer && args.topPlayer.age <= 23 && args.topPlayer.rating >= 82 && args.topPlayer.form >= 80);

  return [
    {
      id: "uli-approved",
      title: "Uli Approved",
      description: "Won the league while keeping the transfer room disciplined.",
      unlocked: args.leagueChampion && transferProfit && args.board >= 70,
    },
    {
      id: "kompanyball-overheating",
      title: "Kompanyball Overheating",
      description: "Bayern's attack went into full throttle and the league could not cope.",
      unlocked: goalStorm,
    },
    {
      id: "almost-a-dynasty",
      title: "Almost A Dynasty",
      description: "Domestic control plus a deep European run, just short of the full dream.",
      unlocked: prestigeDouble || (args.leagueChampion && args.pokalWon && args.uclWon === false && args.finishPoints >= 81),
    },
    {
      id: "loan-army-general",
      title: "Loan Army General",
      description: "Development work mattered and the loan list actually had a purpose.",
      unlocked: loanArmy,
    },
    {
      id: "boardroom-headache",
      title: "Boardroom Headache",
      description: "The spending made sense on paper, but the board did not enjoy the bill.",
      unlocked: boardAnger,
    },
    {
      id: "defensive-wall",
      title: "Defensive Wall",
      description: "Bayern tightened up enough to make the title race feel routine.",
      unlocked: cleanSheetMachine || controlYear,
    },
    {
      id: "young-core",
      title: "Young Core Ignited",
      description: "A young Bayern player turned into a real season-level difference maker.",
      unlocked: youngStar,
    },
    {
      id: "bayern-standard",
      title: "Bayern Standard Met",
      description: "A season that hit the normal club expectation rather than just surviving it.",
      unlocked: args.leagueChampion && trophyHaul && args.fan >= 70,
    },
  ];
}

function buildSeasonVerdict(args: {
  leagueChampion: boolean;
  pokalWon: boolean;
  uclWon: boolean;
  finishPoints: number;
  place: number;
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number; mediaPressure: number };
  board: number;
  leagueRow: { gf: number; ga: number };
  pokalOutcome: { round: string; score: string };
  uclOutcome: { round: string; score: string; leaguePhaseRank?: number };
}) {
  if (args.leagueChampion && args.pokalWon && args.uclWon) {
    return "A full Bayern season: control, trophies, and no obvious collapse point.";
  }
  if (args.leagueChampion && args.pokalWon) {
    return "A domestic double with an UCL shortfall. Good enough for Bayern, but not a full final word.";
  }
  if (args.leagueChampion) {
    return "The league was handled, but the knockouts or cup margins kept the year from becoming legendary.";
  }
  if (args.place <= 2) {
    return args.pokalWon || args.uclWon
      ? "Bayern stayed elite, but one competition broke the rhythm and stopped the season from feeling complete."
      : "A strong Bayern year, but the title margin or European run was too thin for the club standard.";
  }
  if (args.place <= 4) {
    return "Still a good season by most standards, but Bayern's own benchmark made it feel too open and too expensive.";
  }
  return `Below Bayern standards. The model points to ${args.derived.injuryRisk >= 60 ? "injury pressure" : "tactical disruption"}, ${args.derived.mediaPressure >= 60 ? "outside noise" : "inconsistent rhythm"}, and a team that never fully locked in.`;
}

export function recalculateDerivedScores(summary: SimulationSummary) {
  const dataConfidence = dataCoverageScore({
    club: summary.club,
    players: summary.activeRoster
      .filter((entry): entry is Extract<SimulationRosterEntry, { kind: "catalog" }> => entry.kind === "catalog")
      .map((entry) => entry.player),
    matches: summary.recentMatches,
    standing: summary.currentStanding,
  });

  const board = computeBoardConfidence(summary);
  const fan = computeFanConfidence(summary);
  const squadBalance = squadBalanceScore(summary);
  const tactical = tacticalFitScore(summary);
  const budgetEfficiency = budgetEfficiencyScore(summary);
  const mediaPressure = mediaPressureScore(summary);
  const injuryRisk = injuryVulnerabilityScore(summary);
  const finishPoints = projectedPoints(summary, {
    squadBalance,
    tacticalFit: tactical,
    budgetEfficiency,
    boardConfidence: board,
    fanConfidence: fan,
    mediaPressure,
    injuryVulnerability: injuryRisk,
  });
  const finish = projectedFinish(finishPoints);
  const verdict = verdictFromProjection(finishPoints, board, injuryRisk);
  const narrative = [
    `Projection: ${finish} with ${finishPoints} points.`,
    `Squad balance ${squadBalance}/100, tactical fit ${tactical}/100, budget efficiency ${budgetEfficiency}/100.`,
    `Risk profile: media pressure ${mediaPressure}/100 and injury vulnerability ${injuryRisk}/100.`,
    `Board confidence is ${board}/100 and fan confidence is ${fan}/100.`,
    `Cup layer: Pokal winner probability ${Math.round(pokalModel.bayern.winner_probability * 100)}%, UCL title tier against Bayern/Arsenal/PSG/City/Real.`,
    `All fees and projections are deterministic simulator estimates unless a free data source provides the field.`,
  ].join(" ");

  return {
    dataConfidence,
    board,
    fan,
    squadBalance,
    tactical,
    budgetEfficiency,
    mediaPressure,
    injuryRisk,
    finishPoints,
    finish,
    verdict,
    narrative,
  };
}

export async function persistDerivedScores(simulationId: string) {
  const summary = await buildSimulationSummary(simulationId);
  if (!summary) return null;
  const derived = recalculateDerivedScores(summary);

  await updateSimulationRecord(simulationId, {
    data_confidence: derived.dataConfidence,
    board_confidence: derived.board,
    fan_confidence: derived.fan,
  });

  return derived;
}

export async function completeTask(simulationId: string, taskId: TaskId) {
  const store = await getStoreSnapshot();
  const simulation = store.simulations.find((item) => item.id === simulationId);
  if (!simulation) return null;

  const completedTasks = new Set(simulation.completed_tasks);
  completedTasks.add(taskId);
  const allTasks: TaskId[] = ["preseason", "sell", "loan", "sign", "formation"];
  const currentTask = allTasks.find((item) => !completedTasks.has(item)) ?? null;

  await updateSimulationRecord(simulationId, {
    completed_tasks: [...completedTasks],
    current_task: currentTask,
    status: completedTasks.size === 5 ? "ready" : "draft",
  });

  return buildSimulationSummary(simulationId);
}

export async function addDecisionEvent(
  simulationId: string,
  event: {
    event_type: string;
    title: string;
    description: string;
    impact_json: unknown;
  },
) {
  const item: DecisionFeedItem = {
    id: stableId("feed", simulationId, event.event_type, event.title, new Date().toISOString()),
    simulation_id: simulationId,
    event_type: event.event_type,
    title: event.title,
    description: event.description,
    impact_json: event.impact_json,
    created_at: new Date().toISOString(),
  };

  await addDecisionFeed(item);
  return item;
}

function rosterDisplayName(entry: SimulationRosterEntry) {
  return entry.kind === "catalog" ? entry.player.name : entry.player.name;
}

function rosterAge(entry: SimulationRosterEntry) {
  return entry.kind === "catalog" ? entry.player.age ?? 26 : entry.player.age ?? 26;
}

function rosterPosition(entry: SimulationRosterEntry) {
  return entry.kind === "catalog" ? entry.player.position ?? "" : entry.player.position ?? "";
}

function simulationNoise(seed: string, subject: string, channel: string) {
  const value = stableId("noise", seed, subject, channel);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

export async function commitSimulationResult(simulationId: string) {
  const summary = await buildSimulationSummary(simulationId);
  if (!summary) return null;
  const readinessIssues = getSimulationReadinessIssues(summary);
  if (readinessIssues.length) {
    return null;
  }

  const derived = recalculateDerivedScores(summary);
  const tactics = normalizeTactics(summary.simulation.tactics_json ?? null);
  const impact = tacticalImpact(tactics);
  const lineupImpact = analyzeBayernLineup(summary, tactics);
  const setPiecePlan = buildBayernSetPiecePlan(summary, tactics, lineupImpact);
  const runSalt = stableId("simulation-run", simulationId, new Date().toISOString(), Math.random().toString(36).slice(2, 10));

  const league = simulateBundesligaSeason(summary, derived, impact, runSalt);
  const finishPoints = league.bayernRow.pts;
  const finish = ordinal(league.bayernPlace);
  const leagueChampion = league.bayernPlace === 1;

  const board = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        derived.board +
          (leagueChampion ? 8 : league.bayernPlace <= 2 ? 4 : league.bayernPlace <= 4 ? 1 : -4) +
          (finishPoints - derived.finishPoints) * 0.28 +
          impact.control * 0.05 -
          impact.fatigue * 0.04 -
          league.notes.length * 0.2,
      ),
    ),
  );
  const fan = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        derived.fan +
          (leagueChampion ? 10 : league.bayernPlace <= 2 ? 5 : league.bayernPlace <= 4 ? 2 : -6) +
          (league.bayernRow.gf - 90) * 0.08 -
          (league.bayernRow.ga - 30) * 0.06,
      ),
    ),
  );
  const verdict = verdictFromProjection(finishPoints, board, derived.injuryRisk);
  const pokalOutcome = simulatePokalOutcome(summary, derived, impact, runSalt);
  const uclOutcome = simulateUclOutcome(summary, derived, impact, runSalt);
  const pokalWon = pokalOutcome.round === "Won";
  const uclWon = uclOutcome.round === "Won";
  const trophies = [
    ...(leagueChampion ? ["Bundesliga"] : []),
    ...(pokalWon ? ["DFB-Pokal"] : []),
    ...(uclWon ? ["Champions League"] : []),
  ];

  const lineupMap = new Map(
    Array.isArray(summary.lineup?.lineup_json)
      ? (summary.lineup?.lineup_json as Array<{ slot?: unknown; playerId?: unknown }>).flatMap((item) => {
          if (typeof item.slot !== "string" || typeof item.playerId !== "string") return [];
          return [[item.playerId, item.slot] as const];
        })
      : [],
  );
  const awardSalt = stableId("award", simulationId, runSalt);
  const rosterMetrics = summary.activeRoster.map((entry) => {
    const profile = deriveRosterEntryProfile(entry);
    const rosterName = rosterDisplayName(entry);
    const position = rosterPosition(entry);
    const age = rosterAge(entry);
    const role = position.toUpperCase();
    const slot = lineupMap.get(entry.id) ?? null;
    const fit = slot ? slotFitScore(slot, position) : 86;
    const lineupBoost = slot ? (fit / 100) * 10 : entry.kind === "signing" ? 3 : 0;
    const onPitchBoost = slot ? 9 : entry.kind === "catalog" && entry.player.bayern_category === "first_team" ? 3 : 0;
    const roleNoise = simulationNoise(awardSalt, entry.id, "role") * 8 - 4;
    const formNoise = simulationNoise(awardSalt, entry.id, "form") * 6 - 3;
    const executionNoise = simulationNoise(awardSalt, entry.id, "execution") * 5 - 2.5;
    const seasonVariance = simulationNoise(awardSalt, entry.id, "season") * 12 - 6;
    const isPenaltyTaker = rosterName === setPiecePlan.penaltyTaker.name;
    const isFreeKickTaker = rosterName === setPiecePlan.freeKickTaker.name;
    const isCornerTaker = rosterName === setPiecePlan.cornerTaker.name;
    const isCaptain = rosterName === setPiecePlan.captain.name;
    const tacticalAttackBias =
      (role.includes("ST") ? 10 : 0) +
      (role.includes("AM") ? 7 : 0) +
      (role.includes("RW") || role.includes("LW") ? 6 : 0) +
      (role.includes("CM") ? 3 : 0) +
      (tactics.pressingMode === "man" ? (profile.pressure > 70 ? 2 : -1) : 0) +
      (tactics.fullbackRole === "wide" && (role.includes("RW") || role.includes("LW")) ? 2 : 0) +
      (tactics.fullbackRole === "inverted" && role.includes("CM") ? 1.5 : 0) +
      (tactics.strikerDropDeep >= 60 && role.includes("AM") ? 2.5 : 0) +
      (tactics.strikerDropDeep <= 40 && role.includes("ST") ? 2 : -1) +
      (tactics.wingerWidth >= 78 && (role.includes("RW") || role.includes("LW")) ? 2.2 : 0) +
      (tactics.buildUpSpeed >= 74 && role.includes("AM") ? 1.8 : 0);
    const deadBallAttackBoost =
      (isPenaltyTaker ? setPiecePlan.penaltyEdge * 0.12 : 0) +
      (isFreeKickTaker ? setPiecePlan.offensiveEdge * 0.09 : 0) +
      (isCornerTaker ? setPiecePlan.offensiveEdge * 0.08 : 0) +
      (isCaptain ? setPiecePlan.captainInfluence * 0.05 : 0);
    const tacticalControlBias =
      (role.includes("CM") ? tactics.pivotSecurity * 0.04 : 0) +
      (role.includes("DEF") ? (tactics.defensiveLineHeight >= 75 ? 1.8 : 0.8) : 0) +
      (role.includes("GK") ? Math.max(0, 78 - tactics.defensiveLineHeight) * 0.02 : 0);
    const scorers = role.includes("ST")
      ? 20 + tacticalAttackBias * 0.72
      : role.includes("RW") || role.includes("LW")
        ? 8 + tacticalAttackBias * 0.58
        : role.includes("AM")
          ? 4 + tacticalAttackBias * 0.45
          : role.includes("CM")
            ? 3 + tacticalAttackBias * 0.3
            : 0;
    const assisterRole = role.includes("AM")
      ? 12 + tacticalAttackBias * 0.4
      : role.includes("RW") || role.includes("LW")
        ? 9 + tacticalAttackBias * 0.35
        : role.includes("CM")
          ? 5 + tacticalAttackBias * 0.2
          : 0;
    const starBase =
      profile.rating * 0.28 +
      profile.form * 0.24 +
      onPitchBoost * 1.3 +
      (role.includes("GK") ? 2.5 : 0) +
      (role.includes("CB") ? 1.5 : 0) +
      tacticalControlBias * 1.8 +
      roleNoise * 1.4 +
      seasonVariance * 0.9;
    const scorerBase =
      profile.rating * 0.22 +
      profile.form * 0.18 +
      scorers * 1.2 +
      lineupBoost * 1.45 +
      onPitchBoost * 0.5 +
      tacticalAttackBias * 0.5 +
      deadBallAttackBoost * 0.7 +
      (isPenaltyTaker ? 5.5 : 0) +
      seasonVariance +
      Math.max(0, 94 - fit) * -0.05 +
      formNoise * 1.1 +
      executionNoise * 0.4;
    const assisterBase =
      profile.rating * 0.2 +
      profile.form * 0.2 +
      assisterRole * 1.05 +
      lineupBoost * 1.1 +
      tacticalAttackBias * 0.35 +
      (isFreeKickTaker ? setPiecePlan.offensiveEdge * 0.08 : 0) +
      (isCornerTaker ? setPiecePlan.offensiveEdge * 0.06 : 0) +
      seasonVariance * 0.7 +
      executionNoise * 1.1;
    const breakoutBase =
      profile.form * 0.18 +
      Math.max(0, 24 - age) * 1.8 +
      (age <= 22 ? 10 : 0) +
      (slot ? 2 : 0) +
      tacticalAttackBias * 0.25 +
      seasonVariance * 0.85 +
      formNoise * 0.85;
    const disappointmentBase =
      (profile.rating - profile.form) * 0.24 +
      Math.max(0, age - 29) * 0.34 +
      (profile.pressure < 55 ? 3.5 : 0) +
      (slot && fit < 75 ? 3.2 : 0) +
      (slot ? 0 : 1.4) +
      (role.includes("ATT") ? Math.max(0, 12 - tacticalAttackBias) * 0.42 : 0) +
      (role.includes("MID") ? Math.max(0, 10 - tacticalControlBias) * 0.18 : 0) -
      tacticalControlBias * 0.28 +
      (isCaptain ? -2.8 : 0) +
      seasonVariance * -0.35 +
      simulationNoise(awardSalt, entry.id, "disappointment") * 5;
    return {
      name: rosterDisplayName(entry),
      position,
      age,
      rating: profile.rating,
      form: profile.form,
      scorer: scorerBase,
      assister: assisterBase,
      star: starBase,
      breakout: breakoutBase,
      disappointment: disappointmentBase,
    };
  });

  const topScorer = bestBy(rosterMetrics, (item) => item.scorer);
  const topAssister = bestBy(rosterMetrics, (item) => item.assister);
  const bestPlayer = bestBy(rosterMetrics, (item) => item.star);
  const breakoutCandidates = rosterMetrics.filter((player) => player.age <= 23);
  const breakoutPlayer = bestBy(breakoutCandidates.length ? breakoutCandidates : rosterMetrics, (item) => item.breakout);
  const disappointmentBase = bestBy(rosterMetrics, (item) => item.disappointment);
  const transferDisappointment = summary.signings.length
    ? summary.signings.reduce(
        (worst, signing) => {
          const profile = deriveTransferCandidateProfile({
            id: signing.player_external_id,
            name: signing.player_name,
            club: signing.current_club ?? "Unknown",
            shirtNumber: null,
            ageMin: signing.raw_json && typeof signing.raw_json === "object" && typeof (signing.raw_json as { age?: unknown }).age === "number"
              ? Number((signing.raw_json as { age?: number }).age)
              : 25,
            ageMax: signing.raw_json && typeof signing.raw_json === "object" && typeof (signing.raw_json as { age?: unknown }).age === "number"
              ? Number((signing.raw_json as { age?: number }).age)
              : 25,
            nationality: signing.nationality ?? "Unknown",
            position: signing.position ?? "Unknown",
            foot: typeof (signing.raw_json as { foot?: unknown })?.foot === "string" ? String((signing.raw_json as { foot?: unknown }).foot) : "Unknown",
            fee: { min: signing.fee_eur, max: signing.fee_eur },
            contract: "uncertain",
            ability: Math.max(5, Math.round((signing.tactical_fit_score + signing.squad_need_score) / 2) / 10),
            bayernFit: signing.tactical_fit_score / 10,
            keyTraits: Array.isArray((signing.raw_json as { keyTraits?: unknown })?.keyTraits)
              ? ((signing.raw_json as { keyTraits?: unknown }).keyTraits as string[])
              : [],
            inPossessionFit: "",
            outOfPossessionFit: "",
            characterNote: "",
            realism: "Realistic",
            verdict: "",
          });
          const penalty = signing.fee_eur / 10 - signing.tactical_fit_score * 0.6 - signing.squad_need_score * 0.22 + profile.form * -0.08;
          return !worst || penalty > worst.penalty ? { name: signing.player_name, penalty } : worst;
        },
        null as null | { name: string; penalty: number },
      )
    : null;
  const disappointment = transferDisappointment?.name ?? disappointmentBase?.name ?? null;
  const topScorerStats = topScorer
    ? {
        name: topScorer.name,
        goals: Math.round(clamp(18 + (topScorer.scorer - 50) * 0.26 + simulationNoise(awardSalt, topScorer.name, "goals") * 7 - 2, 12, 38)),
        apps: Math.round(clamp(27 + simulationNoise(awardSalt, topScorer.name, "apps") * 8, 24, 34)),
      }
    : null;
  const topAssisterStats = topAssister
    ? {
        name: topAssister.name,
        assists: Math.round(clamp(10 + (topAssister.assister - 48) * 0.16 + simulationNoise(awardSalt, topAssister.name, "assists") * 5, 7, 22)),
        apps: Math.round(clamp(26 + simulationNoise(awardSalt, topAssister.name, "assistApps") * 9, 22, 34)),
      }
    : null;
  const bestPlayerStats = bestPlayer
    ? {
        name: bestPlayer.name,
        rating: Number(clamp(7.0 + (bestPlayer.star - 54) * 0.035 + simulationNoise(awardSalt, bestPlayer.name, "rating") * 0.35, 6.7, 8.9).toFixed(1)),
      }
    : null;
  const breakoutStats = breakoutPlayer
    ? {
        name: breakoutPlayer.name,
        rating: Number(clamp(6.8 + (breakoutPlayer.breakout - 38) * 0.028 + simulationNoise(awardSalt, breakoutPlayer.name, "breakoutRating") * 0.35, 6.5, 8.5).toFixed(1)),
      }
    : null;
  const topScorerLine = topScorerStats ? `${topScorerStats.name} (${topScorerStats.goals} goals)` : "n/a";
  const topAssisterLine = topAssisterStats ? `${topAssisterStats.name} (${topAssisterStats.assists} assists)` : "n/a";
  const bestPlayerLine = bestPlayerStats ? `${bestPlayerStats.name} (${bestPlayerStats.rating.toFixed(1)})` : "n/a";

  const pokalRoundText = formatCupRound(pokalOutcome);
  const uclRoundText = formatCupRound(uclOutcome);
  const achievements = buildAchievements({
    leagueChampion,
    finishPoints,
    board,
    fan,
    derived,
    trophies,
    leagueRow: league.bayernRow,
    signings: summary.signings.length,
    loans: summary.loanedPlayerIds.length,
    sales: summary.soldPlayerIds.length,
    roi: summary.simulation.remaining_budget_eur - summary.simulation.selected_budget_eur,
    pokalWon,
    uclWon,
    topPlayer: bestPlayer,
  });

  const transferVerdict =
    board >= 78
      ? "Smart and coherent window"
      : board >= 64
      ? "Good window, but the board wanted cleaner value"
      : board >= 50
      ? "Needs sales first"
      : "Boardroom headache";

  const seasonVerdict = buildSeasonVerdict({
    leagueChampion,
    pokalWon,
    uclWon,
    finishPoints,
    place: league.bayernPlace,
    derived,
    board,
    leagueRow: league.bayernRow,
    pokalOutcome,
    uclOutcome,
  });

  const narrative = [
    `Bayern finished ${finish} with ${finishPoints} points and a ${formatSignedGoalDiff(league.bayernRow.gf - league.bayernRow.ga)} goal difference.`,
    `Squad balance ${derived.squadBalance}/100, tactical fit ${derived.tactical}/100, budget efficiency ${derived.budgetEfficiency}/100.`,
    `Risk profile: media pressure ${derived.mediaPressure}/100 and injury vulnerability ${derived.injuryRisk}/100.`,
    `Pokal: ${pokalRoundText}. UCL: ${uclRoundText}.`,
    `Set pieces: captain ${setPiecePlan.captain.name}, penalties ${setPiecePlan.penaltyTaker.name}, free kicks ${setPiecePlan.freeKickTaker.name}, corners ${setPiecePlan.cornerTaker.name}.`,
    `Top scorer: ${topScorerLine}, top assister: ${topAssisterLine}, best player: ${bestPlayerLine}.`,
    `Lineup control ${lineupImpact.control}/100, threat ${lineupImpact.threat}/100, chemistry ${lineupImpact.chemistry}/100, out of position ${lineupImpact.outOfPositionCount}.`,
    `Board confidence ${board}/100, fan confidence ${fan}/100.`,
    seasonVerdict,
  ].join(" ");

  const result: SimulationResult = {
    id: stableId("result", simulationId, new Date().toISOString()),
    simulation_id: simulationId,
    projected_finish: finish,
    projected_points: finishPoints,
    squad_balance_score: derived.squadBalance,
    tactical_fit_score: derived.tactical,
    budget_efficiency_score: derived.budgetEfficiency,
    board_confidence_score: board,
    fan_confidence_score: fan,
    media_pressure_score: derived.mediaPressure,
    injury_vulnerability_score: derived.injuryRisk,
    risk_rating: derived.injuryRisk >= 75 ? "High" : derived.injuryRisk >= 50 ? "Moderate" : "Low",
    verdict,
    narrative,
    methodology_json: {
      boardObjectives: boardObjectives({
        lastFinish: league.bayernPlace,
        lastTrophies: trophies,
        injuryRisk: derived.injuryRisk,
        budgetEfficiency: derived.budgetEfficiency,
      }),
      calculation: {
        ...derived,
        finishPoints,
        finish,
        pointsSwing: finishPoints - derived.finishPoints,
        trophies,
        lineupImpact: {
          selectedCount: lineupImpact.selectedCount,
          outOfPositionCount: lineupImpact.outOfPositionCount,
          startingQuality: lineupImpact.startingQuality,
          benchQuality: lineupImpact.benchQuality,
          attack: lineupImpact.attack,
          defence: lineupImpact.defence,
          midfield: lineupImpact.midfield,
          goalkeeper: lineupImpact.goalkeeper,
          control: lineupImpact.control,
          threat: lineupImpact.threat,
          chemistry: lineupImpact.chemistry,
          depth: lineupImpact.depth,
          risk: lineupImpact.risk,
          rotation: lineupImpact.rotation,
          width: lineupImpact.width,
        },
        tacticalImpact: impact,
        setPiecePlan,
      },
      seasonOutcome: {
        league: { ...league.bayernRow, pos: league.bayernPlace },
        table: league.table,
        pokal: {
          round: pokalOutcome.round,
          score: pokalOutcome.score,
          winner: pokalOutcome.winner,
          opponent: pokalOutcome.opponent ?? null,
          rounds: pokalOutcome.rounds ?? [],
        },
        ucl: {
          round: uclOutcome.round,
          score: uclOutcome.score,
          winner: uclOutcome.winner,
          opponent: uclOutcome.opponent ?? null,
          leaguePhasePoints: uclOutcome.leaguePhasePoints,
          leaguePhaseRank: uclOutcome.leaguePhaseRank,
          rounds: uclOutcome.rounds ?? [],
        },
        trophies,
        achievements,
        topScorer: topScorerStats ? { ...topScorerStats, goalsPerGame: Number((topScorerStats.goals / topScorerStats.apps).toFixed(2)) } : null,
        topAssister: topAssisterStats,
        bestPlayer: bestPlayerStats,
        breakoutPlayer: breakoutStats,
        disappointment,
        transferVerdict,
        verdictText: seasonVerdict,
        setPiecePlan,
      },
      competitions: {
        pokal: pokalModel.bayern,
        ucl: uclTitleModel.slice(0, 5),
      },
      note: "Full league simulation with controlled variance from tactical fit, injuries, fixture pressure, cup volatility, and transfer quality.",
    },
    created_at: new Date().toISOString(),
  };

  await addResult(result);
  await updateSimulationRecord(simulationId, {
    status: "simulated",
    completed_at: new Date().toISOString(),
  });

  return result;
}

export function getSimulationReadinessIssues(
  summary: SimulationSummary,
  current?: {
    formation?: string;
    lineup?: Array<{ slot: string; playerId: string }>;
    tactics?: { [key: string]: unknown } | null;
    setPieces?: { captainId: string | null; penaltyTakerId: string | null; freeKickTakerId: string | null; cornerTakerId: string | null } | null;
  },
) {
  const issues: string[] = [];
  const lineup = Array.isArray(summary.lineup?.lineup_json)
    ? (summary.lineup?.lineup_json as Array<{ slot?: unknown; playerId?: unknown }>).filter(
        (item) => typeof item.slot === "string" && typeof item.playerId === "string",
      )
    : [];
  const formation = summary.lineup?.formation ?? summary.simulation.formation ?? null;
  const expectedSlots = formation ? formationSlots(formation as Parameters<typeof formationSlots>[0]).length : 0;
  const tactics = summary.simulation.tactics_json;
  const setPieces = summary.simulation.set_pieces_json;
  const lineupPlayerIds = new Set(lineup.map((item) => item.playerId as string));
  const setPieceValues = setPieces
    ? [setPieces.captainId, setPieces.penaltyTakerId, setPieces.freeKickTakerId, setPieces.cornerTakerId].filter(Boolean)
    : [];
  const savedLineupKey = lineupSignature(formation, lineup as Array<{ slot: string; playerId: string }>);
  const currentLineupKey = current ? lineupSignature(current.formation ?? null, current.lineup ?? []) : savedLineupKey;
  const currentTacticsKey = current ? stableKey(current.tactics ?? null) : stableKey(tactics);
  const currentSetPiecesKey = current ? stableKey(current.setPieces ?? null) : stableKey(setPieces);

  if (!formation) {
    issues.push("Choose and save a formation first.");
  }
  if (!lineup.length || lineup.length < expectedSlots) {
    issues.push("Fill and save the starting XI.");
  }
  if (!tactics) {
    issues.push("Save tactical instructions first.");
  }
  if (!setPieces) {
    issues.push("Choose captain and set-piece roles first.");
  } else {
    if (!setPieces.captainId) issues.push("Choose a captain from the starting XI.");
    if (!setPieces.penaltyTakerId) issues.push("Choose a penalty taker from the starting XI.");
    if (!setPieces.freeKickTakerId) issues.push("Choose a free-kick taker from the starting XI.");
    if (!setPieces.cornerTakerId) issues.push("Choose a corner taker from the starting XI.");
    for (const value of setPieceValues) {
      if (!lineupPlayerIds.has(value as string)) {
        issues.push("Set-piece roles must come from the starting XI.");
        break;
      }
    }
  }

  if (current && currentLineupKey !== savedLineupKey) {
    issues.push("Save the current starting XI.");
  }
  if (current && currentTacticsKey !== stableKey(tactics)) {
    issues.push("Save the current tactics.");
  }
  if (current && currentSetPiecesKey !== stableKey(setPieces)) {
    issues.push("Save the current set-piece roles.");
  }

  return [...new Set(issues)];
}

function lineupSignature(formation: string | null, lineup: Array<{ slot: string; playerId: string }>) {
  const sorted = [...lineup].filter((item) => item.slot && item.playerId).sort((a, b) => a.slot.localeCompare(b.slot));
  return `${formation ?? ""}|${sorted.map((item) => `${item.slot}:${item.playerId}`).join(",")}`;
}

function stableKey(value: unknown) {
  return JSON.stringify(value ?? null);
}
