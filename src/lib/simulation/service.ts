import type {
  ClubRecord,
  DecisionFeedItem,
  PlayerRecord,
  SeasonMatchResult,
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
import { inferPlayerImportance } from "../football/negotiation";
import { buildSeasonStats } from "../football/seasonStats";
import { formationSlots } from "./formations";
import { simulateBundesligaSeason, simulatePokalOutcome, simulateUclOutcome } from "./league";
import { previewLoanImpact, previewSaleImpact, previewSigningImpact } from "../football/decisionImpact";

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
  const baselineRoster = buildRosterEntries(sourcePlayers, [], [], { includeSignings: false });
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
    baselineRoster,
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

type StoryCandidate = {
  label: string;
  summary: string;
  score: number;
  reasons: string[];
};

function buildSeasonStory(args: {
  summary: SimulationSummary;
  leaguePlace: number;
  leaguePoints: number;
  league: { bayernRow: { gf: number; ga: number }; table: Array<{ pos: number; club: string; gf: number; ga: number; pts: number }> };
  pokalOutcome: { round: string; score: string; winner: string; opponent?: string | null; matchResults?: SeasonMatchResult[] };
  uclOutcome: { round: string; score: string; winner: string; opponent?: string | null; matchResults?: SeasonMatchResult[]; leaguePhasePoints?: number; leaguePhaseRank?: number };
  board: number;
  fan: number;
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number; mediaPressure: number };
  lineupImpact: { startingQuality: number; benchQuality: number; depth: number; rotation: number; outOfPositionCount: number };
  tacticalImpact: { control: number; threat: number; chemistry: number; fatigue: number; risk: number };
  seasonVerdict: string;
  transferVerdict: string;
  trophies: string[];
  matchResults: SeasonMatchResult[];
}) {
  const decisionCandidates: StoryCandidate[] = [];
  const rosterLookup = new Map<string, SimulationRosterEntry>();
  for (const entry of [...args.summary.activeRoster, ...args.summary.sellRoster]) {
    const key = entry.kind === "catalog" ? entry.player.id : entry.player.id;
    if (!rosterLookup.has(key)) rosterLookup.set(key, entry);
  }

  for (const decision of args.summary.decisions) {
    const rosterEntry = rosterLookup.get(decision.player_id) ?? null;
    const player = rosterEntry?.player ?? null;
    const importance = inferPlayerImportance({
      playerImportance: player && "player_importance" in player ? (player.player_importance ?? null) : null,
      bayernCategory: player && "bayern_category" in player ? (player.bayern_category ?? null) : null,
      age: player?.age ?? null,
      transferValueMinEurM: player && "transfer_value_min_eur_m" in player ? (player.transfer_value_min_eur_m ?? null) : null,
      transferValueMaxEurM: player && "transfer_value_max_eur_m" in player ? (player.transfer_value_max_eur_m ?? null) : null,
      need: player && "data_confidence" in player ? (player.data_confidence ?? null) : null,
      position: player?.position ?? null,
      rating: player && "rating" in player ? (player.rating ?? null) : null,
    });
    const wageTier = resolveWageTier(player && "wage_tier" in player ? (player.wage_tier ?? null) : null, importance);
    const squadDepthBefore = countRosterDepth(args.summary.activeRoster, player?.position ?? null);
    const replacementQuality = player && "data_confidence" in player ? player.data_confidence : decision.confidence_score;
    const tacticalImportance = player && "data_confidence" in player ? Math.max(55, player.data_confidence) : decision.confidence_score;
    const youthPathwayValue = player && "academy_pathway_value" in player ? (player.academy_pathway_value ?? 0) : 0;
    let impact:
      | ReturnType<typeof previewSaleImpact>
      | ReturnType<typeof previewLoanImpact>
      | {
          budgetDelta: number;
          wageDelta: number;
          squadDepthDelta: number;
          boardConfidenceDelta: number;
          fanConfidenceDelta: number;
          mediaPressureDelta: number;
          tacticalFitDelta: number;
          youthPathwayDelta: number;
          replacementRisk: number;
          severity: "positive" | "neutral" | "warning" | "danger";
          reasons: string[];
        };

    if (decision.decision_type === "sell") {
      impact = previewSaleImpact({
        playerId: decision.player_id,
        playerName: rosterEntry?.kind === "catalog" ? rosterEntry.player.name : player?.name ?? "Player",
        playerImportance: importance,
        wageTier,
        boardSaleStance: player && "board_sale_stance" in player ? (player.board_sale_stance ?? null) : null,
        transferFeeEurM: decision.fee_eur ?? Math.max(10, replacementQuality / 2),
        replacementQuality,
        squadDepthBefore,
        tacticalImportance,
        youthPathwayValue,
      });
    } else if (decision.decision_type === "loan") {
      impact = previewLoanImpact({
        playerId: decision.player_id,
      playerName: rosterEntry?.kind === "catalog" ? rosterEntry.player.name : player?.name ?? "Player",
      playerImportance: importance,
      wageTier,
      age: player?.age ?? 24,
      pathwayValue: youthPathwayValue,
      wageCoveragePercent: decision.replacement_warning ? 25 : 40,
      minutesPromise:
        importance === "development" ||
        importance === "loan_candidate" ||
        (player && "minutes_expectation" in player ? (player.minutes_expectation ?? null) : null) === "prospect",
      squadDepthBefore,
      tacticalImportance,
    });
    } else if (decision.decision_type === "development") {
      impact = {
        budgetDelta: 0,
        wageDelta: 0.2,
        squadDepthDelta: importance === "development" ? -0.2 : -0.6,
        boardConfidenceDelta: importance === "development" ? 1.6 : -0.8,
        fanConfidenceDelta: importance === "development" ? 1.9 : -0.5,
        mediaPressureDelta: importance === "development" ? -0.4 : 0.3,
        tacticalFitDelta: importance === "development" ? 0.8 : -0.2,
        youthPathwayDelta: importance === "development" ? 2.2 : 0.5,
        replacementRisk: importance === "development" ? 10 : 28,
        severity: importance === "development" ? "positive" : "neutral",
        reasons:
          importance === "development"
            ? ["The player can develop without blocking the first team.", "The pathway stays open for later decisions."]
            : ["Development duty is fine, but the player is not an obvious academy-only case.", "The short-term depth hit is small but real."],
      };
    } else {
      impact = {
        budgetDelta: 0,
        wageDelta: 0,
        squadDepthDelta: importance === "core" ? 0.9 : importance === "starter" ? 0.6 : 0.2,
        boardConfidenceDelta: importance === "core" ? 2.5 : importance === "starter" ? 1.4 : 0.4,
        fanConfidenceDelta: importance === "core" ? 2.2 : importance === "starter" ? 1.1 : 0.4,
        mediaPressureDelta: importance === "core" ? -0.3 : -0.1,
        tacticalFitDelta: importance === "core" ? 1.2 : importance === "starter" ? 0.7 : 0.3,
        youthPathwayDelta: importance === "development" ? 1.2 : 0.2,
        replacementRisk: importance === "core" ? 12 : importance === "starter" ? 18 : 24,
        severity: importance === "core" ? "positive" : "neutral",
        reasons:
          importance === "core"
            ? ["Keeping a core player protects the spine of the XI.", "The squad benefits from stability rather than churn."]
            : ["Retaining the player is sensible and keeps the squad balanced.", "There is no major downside to keeping the role intact."],
      };
    }

    const score =
      impact.boardConfidenceDelta +
      impact.fanConfidenceDelta +
      impact.tacticalFitDelta * 0.35 +
      impact.youthPathwayDelta * 0.2 +
      impact.squadDepthDelta * 1.1 +
      impact.budgetDelta * 0.04 +
      impact.wageDelta * 0.7 -
      impact.mediaPressureDelta * 0.45 -
      impact.replacementRisk * 0.08;

    const label =
      decision.decision_type === "sell"
        ? `Selling ${rosterEntry?.kind === "catalog" ? rosterEntry.player.name : player?.name ?? "Player"}`
        : decision.decision_type === "loan"
        ? `Loaning ${rosterEntry?.kind === "catalog" ? rosterEntry.player.name : player?.name ?? "Player"}`
        : decision.decision_type === "development"
        ? `Development role for ${rosterEntry?.kind === "catalog" ? rosterEntry.player.name : player?.name ?? "Player"}`
        : `Keeping ${rosterEntry?.kind === "catalog" ? rosterEntry.player.name : player?.name ?? "Player"}`;

    decisionCandidates.push({
      label,
      score,
      summary: impact.reasons.slice(0, 2).join(" "),
      reasons: impact.reasons.slice(0, 5),
    });
  }

  for (const signing of args.summary.signings) {
    const raw = (signing.raw_json && typeof signing.raw_json === "object" ? (signing.raw_json as Record<string, unknown>) : {}) ?? {};
    const approval = (raw.approval && typeof raw.approval === "object" ? (raw.approval as Record<string, unknown>) : {}) ?? {};
    const rawNeed = typeof (raw as { need?: unknown }).need === "number" ? Number((raw as { need?: number }).need) : signing.squad_need_score;
    const rawAbility = typeof (raw as { ability?: unknown }).ability === "number" ? Number((raw as { ability?: number }).ability) : Math.round(signing.tactical_fit_score / 10);
    const rawFit = typeof (raw as { bayernFit?: unknown }).bayernFit === "number" ? Number((raw as { bayernFit?: number }).bayernFit) * 10 : signing.tactical_fit_score;
    const rawAge = typeof (raw as { age?: unknown }).age === "number" ? Number((raw as { age?: number }).age) : 25;
    const rawContract = typeof (raw as { contract?: unknown }).contract === "string" ? String((raw as { contract?: string }).contract) : "uncertain";
    const rawWageDemand = parseMillionsFromText(typeof (raw as { bayernDemand?: unknown }).bayernDemand === "string" ? String((raw as { bayernDemand?: string }).bayernDemand) : null) ?? signing.fee_eur * 0.04;
    const rawCurrentWage = parseMillionsFromText(typeof (raw as { currentWage?: unknown }).currentWage === "string" ? String((raw as { currentWage?: string }).currentWage) : null);
    const wageConcern = typeof (raw as { wageConcern?: unknown }).wageConcern === "string" ? String((raw as { wageConcern?: string }).wageConcern) : null;
    const approvalTotal = typeof (approval as { total?: unknown }).total === "number" ? Number((approval as { total?: number }).total) : signing.tactical_fit_score;
    const approvalDecision = String((approval as { decision?: unknown }).decision ?? "The board approved the move.");
    const importance = inferPlayerImportance({
      age: rawAge,
      need: rawNeed,
      rating: rawAbility * 10,
      position: signing.position,
      feeEurM: signing.fee_eur,
    });
    const impact = previewSigningImpact({
      playerId: signing.player_external_id,
      playerName: signing.player_name,
      feeEurM: signing.fee_eur,
      wageDemandTier: mapWageConcernToTier(wageConcern) ?? resolveWageTier(null, importance),
      targetImportance: importance,
      tacticalFit: rawFit,
      squadNeed: signing.squad_need_score,
      injuryRisk: Math.max(15, 35 - (signing.tactical_fit_score - signing.squad_need_score) * 0.12),
      contractYears: parseContractYears(rawContract),
      blocksYouthPathway: signing.squad_need_score >= 72,
      replacementQuality: signing.seller_resistance ?? signing.squad_need_score,
      sellerResistance: signing.seller_resistance ?? approvalTotal,
    });
    const feePressure = signing.fee_eur / 12;
    const wagePressure = rawCurrentWage && rawWageDemand ? Math.max(0, rawWageDemand - rawCurrentWage) * 5 : 0;
    const score =
      impact.boardConfidenceDelta +
      impact.fanConfidenceDelta +
      impact.tacticalFitDelta * 0.35 +
      impact.youthPathwayDelta * 0.15 +
      approvalTotal * 0.12 -
      impact.mediaPressureDelta * 0.35 -
      impact.replacementRisk * 0.08 -
      feePressure * 0.2 -
      wagePressure * 0.9;

    decisionCandidates.push({
      label: `Signing ${signing.player_name}`,
      score,
      summary: `${approvalDecision} ${impact.reasons.slice(0, 2).join(" ")}`.trim(),
      reasons: [...impact.reasons.slice(0, 3), signing.replacement_warning ?? null, wageConcern ? `Wage concern: ${wageConcern}.` : null]
        .filter((item): item is string => Boolean(item))
        .slice(0, 5),
    });
  }

  const sortedCandidates = [...decisionCandidates].sort((a, b) => b.score - a.score);
  const bestCandidate = sortedCandidates[0] ?? null;
  const worstCandidate = sortedCandidates.length > 1 ? sortedCandidates[sortedCandidates.length - 1] ?? null : null;

  const boardVerdict =
    args.board >= 80
      ? "Board confidence is strong and the plan looks controlled."
      : args.board >= 65
        ? "The board accepts the direction, but still wants cleaner value."
        : args.board >= 50
          ? "The board sees the logic, but the costs or timing are awkward."
          : "The board is not comfortable with how the season was managed.";

  const fanVerdict =
    args.fan >= 80
      ? "Fans are clearly onside with the direction."
      : args.fan >= 65
        ? "The fanbase is mixed, but the season still feels coherent."
        : args.fan >= 50
          ? "Fans are divided and want more obvious ambition."
          : "Supporters are frustrated and the mood is sharp.";

  const transferGrade = gradeTransferWindow(args.board, args.fan, args.trophies.length, args.transferVerdict, args.leaguePlace);
  const keyTurningPoint = determineKeyTurningPoint(args.matchResults, args.pokalOutcome, args.uclOutcome, args.leaguePlace);
  const mediaHeadline = buildMediaHeadline(args, bestCandidate, worstCandidate);
  const whyThisHappened = buildWhyThisHappened({
    seasonVerdict: args.seasonVerdict,
    bestDecision: bestCandidate?.label ?? "No clear decision",
    worstDecision: worstCandidate?.label ?? "No clear downside",
    boardVerdict,
    fanVerdict,
    leaguePoints: args.leaguePoints,
    leagueRow: args.league.bayernRow,
    derived: args.derived,
    lineupImpact: args.lineupImpact,
    tacticalImpact: args.tacticalImpact,
    keyTurningPoint,
  });

  return {
    bestDecision: bestCandidate ? `${bestCandidate.label} - ${bestCandidate.summary}` : null,
    worstDecision: worstCandidate ? `${worstCandidate.label} - ${worstCandidate.summary}` : null,
    keyTurningPoint,
    mediaHeadline,
    transferGrade,
    boardVerdict,
    fanVerdict,
    whyThisHappened,
    matchResults: args.matchResults,
  };
}

function resolveWageTier(value: unknown, importance: ReturnType<typeof inferPlayerImportance>): "low" | "mid" | "high" | "elite" | "superstar" {
  if (value === "low" || value === "mid" || value === "high" || value === "elite" || value === "superstar") {
    return value;
  }
  if (importance === "core") return "superstar";
  if (importance === "starter") return "elite";
  if (importance === "rotation") return "high";
  if (importance === "development") return "mid";
  return "low";
}

function mapWageConcernToTier(value: unknown): "low" | "mid" | "high" | "elite" | "superstar" | null {
  if (value === "Low") return "low";
  if (value === "Medium") return "mid";
  if (value === "High") return "high";
  if (value === "Very High") return "superstar";
  return null;
}

function countRosterDepth(roster: SimulationRosterEntry[], position: string | null) {
  const bucket = (position ?? "").toUpperCase();
  return roster.filter((entry) => {
    const candidatePosition = entry.kind === "catalog" ? entry.player.position : entry.player.position;
    const pos = (candidatePosition ?? "").toUpperCase();
    if (!bucket) return true;
    if (bucket.includes("GK")) return pos.includes("GK");
    if (bucket.includes("CB")) return pos.includes("CB") || pos.includes("DEF");
    if (bucket.includes("LB")) return pos.includes("LB") || pos.includes("LWB") || pos.includes("CB");
    if (bucket.includes("RB")) return pos.includes("RB") || pos.includes("RWB") || pos.includes("CB");
    if (bucket.includes("DM")) return pos.includes("DM") || pos.includes("CM");
    if (bucket.includes("CM")) return pos.includes("CM") || pos.includes("DM") || pos.includes("AM");
    if (bucket.includes("AM")) return pos.includes("AM") || pos.includes("CAM");
    if (bucket.includes("LW") || bucket.includes("RW")) return pos.includes("W") || pos.includes("FWD") || pos.includes("AM");
    if (bucket.includes("ST")) return pos.includes("ST") || pos.includes("FWD");
    return pos === bucket;
  }).length;
}

function parseMillionsFromText(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/\*\*/g, "").replace(/,/g, "").trim();
  const euroYear = cleaned.match(/€\s*([\d.]+)\s*m\/y/i);
  if (euroYear) return Number(euroYear[1]);
  const poundYear = cleaned.match(/£\s*([\d.]+)\s*m\/y/i);
  if (poundYear) return Number(poundYear[1]) * 1.17;
  const euroWeek = cleaned.match(/€\s*([\d.]+)\s*k\s*p\/w/i);
  if (euroWeek) return Number(euroWeek[1]) * 0.052;
  const poundWeek = cleaned.match(/£\s*([\d.]+)\s*k\s*p\/w/i);
  if (poundWeek) return Number(poundWeek[1]) * 0.052 * 1.17;
  return null;
}

function parseContractYears(contract: string) {
  const match = contract.match(/20(2[6-9]|3[0-5])/);
  if (!match) return 3;
  const year = Number(match[0].slice(-2));
  return clamp(year - 26, 1, 5);
}

function gradeTransferWindow(board: number, fan: number, trophies: number, transferVerdict: string, place: number) {
  const positiveAnchor = board >= 80 && fan >= 75 && (trophies > 0 || place === 1);
  const strong = board >= 72 && fan >= 68;
  const decent = board >= 62 && fan >= 58;
  if (positiveAnchor) return "A+";
  if (strong && /smart|coherent|good/i.test(transferVerdict)) return "A";
  if (strong) return "A-";
  if (decent) return "B";
  if (board >= 50) return "C";
  if (board >= 40) return "D";
  return "F";
}

function determineKeyTurningPoint(
  matchResults: SeasonMatchResult[],
  pokalOutcome: { round: string; score: string; winner: string; opponent?: string | null },
  uclOutcome: { round: string; score: string; winner: string; opponent?: string | null },
  leaguePlace: number,
) {
  if (pokalOutcome.winner !== "Bayern Munich" && pokalOutcome.round !== "Won") {
    return `The Pokal exit against ${pokalOutcome.opponent ?? pokalOutcome.winner} in the ${pokalOutcome.round.toLowerCase()} (${pokalOutcome.score}) changed the tone.`;
  }
  if (uclOutcome.winner !== "Bayern Munich" && uclOutcome.round !== "Won") {
    return `The Champions League exit against ${uclOutcome.opponent ?? uclOutcome.winner} in the ${uclOutcome.round.toLowerCase()} (${uclOutcome.score}) changed the tone.`;
  }
  const leagueMatches = matchResults.filter((item) => item.competition === "bundesliga");
  const biggestWin = [...leagueMatches].sort((a, b) => b.scoreFor - b.scoreAgainst - (a.scoreFor - a.scoreAgainst) || b.scoreFor - a.scoreFor)[0];
  const biggestLoss = [...leagueMatches].sort((a, b) => b.scoreAgainst - b.scoreFor - (a.scoreAgainst - a.scoreFor) || b.scoreAgainst - a.scoreAgainst)[0];
  if (leaguePlace === 1 && biggestWin && biggestWin.scoreFor - biggestWin.scoreAgainst >= 2) {
    return `The ${biggestWin.round} win over ${biggestWin.opponent} (${biggestWin.scoreFor}-${biggestWin.scoreAgainst}) set the title rhythm.`;
  }
  if (biggestLoss && biggestLoss.scoreAgainst > biggestLoss.scoreFor) {
    return `The ${biggestLoss.round} loss to ${biggestLoss.opponent} (${biggestLoss.scoreFor}-${biggestLoss.scoreAgainst}) was the most expensive swing.`;
  }
  if (biggestWin) {
    return `The ${biggestWin.round} win over ${biggestWin.opponent} (${biggestWin.scoreFor}-${biggestWin.scoreAgainst}) was the cleanest control point.`;
  }
  return "No single turning point stood above the rest.";
}

function buildMediaHeadline(
  args: {
    leaguePlace: number;
    leaguePoints: number;
    trophies: string[];
    seasonVerdict: string;
    transferVerdict: string;
    board: number;
    fan: number;
    derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number; mediaPressure: number };
  },
  bestCandidate: StoryCandidate | null,
  worstCandidate: StoryCandidate | null,
) {
  if (args.leaguePlace === 1 && args.trophies.length >= 2) {
    return "Bayern's control and depth held the season together.";
  }
  if (args.leaguePlace === 1) {
    return "Bayern stayed on script at home, but the cup margins carried the story.";
  }
  if (args.leaguePlace <= 2) {
    return `A strong Bayern side still left one or two questions hanging after ${args.leaguePoints} points, board ${args.board}/100, and fan ${args.fan}/100.`;
  }
  if (args.derived.mediaPressure >= 60) {
    return "Pressure builds as the season drifts away from Bayern's standard.";
  }
  return bestCandidate || worstCandidate
    ? `The window told the story: ${bestCandidate?.label ?? "one smart move"}${worstCandidate ? ` and ${worstCandidate.label ?? "one costly call"}` : " with no obvious miss standing out"}.`
    : `Bayern produced a solid season, but not enough to quiet the debate after ${args.leaguePoints} points and a ${args.seasonVerdict.toLowerCase()} with a ${args.transferVerdict.toLowerCase()} window.`;
}

function buildWhyThisHappened(args: {
  seasonVerdict: string;
  bestDecision: string;
  worstDecision: string;
  boardVerdict: string;
  fanVerdict: string;
  leaguePoints: number;
  leagueRow: { gf: number; ga: number };
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number; mediaPressure: number };
  lineupImpact: { startingQuality: number; benchQuality: number; depth: number; rotation: number; outOfPositionCount: number };
  tacticalImpact: { control: number; threat: number; chemistry: number; fatigue: number; risk: number };
  keyTurningPoint: string;
}) {
  const tacticalLine =
    args.lineupImpact.outOfPositionCount > 0
      ? `${args.lineupImpact.outOfPositionCount} role mismatch${args.lineupImpact.outOfPositionCount === 1 ? "" : "es"} reduced tactical fit.`
      : "The starting XI stayed mostly on natural roles, so the tactical base stayed stable.";
  const tacticalShape =
    args.tacticalImpact.control >= 72
      ? "Control and pressing kept most matches in Bayern's rhythm."
      : args.tacticalImpact.threat >= 70
        ? "Chance creation stayed strong, but control was a little looser."
        : "The tactical control was useful, but not strong enough to dominate every game.";
  const squadShape =
    args.lineupImpact.startingQuality >= 78
      ? "The starting XI had a strong enough baseline to keep Bayern competitive in most spells."
      : "The starting XI was good, but not always dominant enough to close games early.";
  const benchShape =
    args.lineupImpact.benchQuality >= 72
      ? "The bench helped the team absorb rotation without too much drop-off."
      : "The bench did not always protect the level when rotation hit.";
  const depthShape =
    args.lineupImpact.depth >= 72
      ? "Squad depth was useful when the schedule tightened."
      : "Squad depth was only average, so the schedule still had bite.";
  const rotationShape =
    args.lineupImpact.rotation >= 60
      ? "Rotation load stayed noticeable, which kept the season from feeling simple."
      : "Rotation load was manageable for most of the run.";
  const strengthLine =
    args.derived.squadBalance >= 72
      ? "The squad had enough structure to handle pressure."
      : "The squad structure was good enough, but not dominant.";
  const riskLine =
    args.derived.injuryRisk >= 60
      ? "Injury pressure kept the ceiling from feeling truly clean."
      : "Injury pressure stayed manageable for most of the run.";
  return [
    args.seasonVerdict,
    `${tacticalLine} ${tacticalShape} ${squadShape} ${benchShape} ${depthShape} ${rotationShape} ${strengthLine} ${riskLine}`,
    `Best decision: ${args.bestDecision}. Worst decision: ${args.worstDecision}.`,
    `Board view: ${args.boardVerdict} Fan view: ${args.fanVerdict}.`,
    `Key turning point: ${args.keyTurningPoint}.`,
    `The final shape was a product of ${args.leaguePoints} points, ${args.leagueRow.gf} goals scored, and ${args.leagueRow.ga} goals conceded.`,
  ].join(" ");
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
  const disappointment = summary.signings.length > 1 ? transferDisappointment?.name ?? disappointmentBase?.name ?? null : disappointmentBase?.name ?? null;
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

  const matchResults = [
    ...(league.matchResults ?? []),
    ...(pokalOutcome.matchResults ?? []),
    ...(uclOutcome.matchResults ?? []),
  ];
  const seasonStory = buildSeasonStory({
    summary,
    leaguePlace: league.bayernPlace,
    leaguePoints: finishPoints,
    league,
    pokalOutcome,
    uclOutcome,
    board,
    fan,
    derived,
    lineupImpact: {
      startingQuality: lineupImpact.startingQuality,
      benchQuality: lineupImpact.benchQuality,
      depth: lineupImpact.depth,
      rotation: lineupImpact.rotation,
      outOfPositionCount: lineupImpact.outOfPositionCount,
    },
    tacticalImpact: impact,
    seasonVerdict,
    transferVerdict,
    trophies,
    matchResults,
  });
  const seasonStats = buildSeasonStats({
    summary,
    matchResults,
    derived,
    lineupImpact: {
      startingQuality: lineupImpact.startingQuality,
      benchQuality: lineupImpact.benchQuality,
      depth: lineupImpact.depth,
      rotation: lineupImpact.rotation,
      outOfPositionCount: lineupImpact.outOfPositionCount,
    },
    tacticalImpact: impact,
    setPiecePlan,
  });

  const narrative = [
    `Bayern finished ${finish} with ${finishPoints} points and a ${formatSignedGoalDiff(league.bayernRow.gf - league.bayernRow.ga)} goal difference.`,
    `Squad balance ${derived.squadBalance}/100, tactical fit ${derived.tactical}/100, budget efficiency ${derived.budgetEfficiency}/100.`,
    `Risk profile: media pressure ${derived.mediaPressure}/100 and injury vulnerability ${derived.injuryRisk}/100.`,
    `Pokal: ${pokalRoundText}. UCL: ${uclRoundText}.`,
    `Set pieces: captain ${setPiecePlan.captain.name}, penalties ${setPiecePlan.penaltyTaker.name}, free kicks ${setPiecePlan.freeKickTaker.name}, corners ${setPiecePlan.cornerTaker.name}.`,
    `Top scorer: ${topScorerLine}, top assister: ${topAssisterLine}, best player: ${bestPlayerLine}.`,
    `Lineup control ${lineupImpact.control}/100, threat ${lineupImpact.threat}/100, chemistry ${lineupImpact.chemistry}/100, out of position ${lineupImpact.outOfPositionCount}.`,
    `Tactical summary: ${seasonStats.tacticalSummary}`,
    `Availability: ${seasonStats.availabilitySummary}`,
    `Board confidence ${board}/100, fan confidence ${fan}/100.`,
    seasonVerdict,
  ].join(" ");

  const resultMatchResults = matchResults;
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
    best_decision: seasonStory.bestDecision,
    worst_decision: seasonStory.worstDecision,
    key_turning_point: seasonStory.keyTurningPoint,
    media_headline: seasonStory.mediaHeadline,
    transfer_grade: seasonStory.transferGrade,
    board_verdict: seasonStory.boardVerdict,
    fan_verdict: seasonStory.fanVerdict,
    why_this_happened: seasonStory.whyThisHappened,
    match_results: resultMatchResults,
    team_stats: seasonStats.teamStats,
    player_stats: seasonStats.playerStats,
    injury_report: seasonStats.injuryReport,
    tactical_summary: seasonStats.tacticalSummary,
    availability_summary: seasonStats.availabilitySummary,
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
        boardVerdict: seasonStory.boardVerdict,
        fanVerdict: seasonStory.fanVerdict,
        whyThisHappened: seasonStory.whyThisHappened,
        bestDecision: seasonStory.bestDecision,
        worstDecision: seasonStory.worstDecision,
        keyTurningPoint: seasonStory.keyTurningPoint,
        mediaHeadline: seasonStory.mediaHeadline,
        transferGrade: seasonStory.transferGrade,
        matchResults: resultMatchResults,
        setPiecePlan,
        teamStats: seasonStats.teamStats,
        playerStats: seasonStats.playerStats,
        injuryReport: seasonStats.injuryReport,
        tacticalSummary: seasonStats.tacticalSummary,
        availabilitySummary: seasonStats.availabilitySummary,
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
