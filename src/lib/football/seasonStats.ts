import type { SeasonInjuryEvent, SeasonInjuryReport, SeasonPlayerStat, SeasonTeamStats, SeasonMatchResult, SimulationSummary } from "../types";
import { average, clamp, stableId } from "../utils";
import { deriveRosterEntryProfile } from "./playerModel";
import type { SetPiecePlan } from "./setPieces";

type SeasonStatBuildArgs = {
  summary: SimulationSummary;
  matchResults: SeasonMatchResult[];
  derived: { injuryRisk: number; tactical: number; squadBalance: number; budgetEfficiency: number; mediaPressure: number };
  lineupImpact: { startingQuality: number; benchQuality: number; depth: number; rotation: number; outOfPositionCount: number };
  tacticalImpact: { control: number; threat: number; chemistry: number; fatigue: number; risk: number };
  setPiecePlan?: SetPiecePlan | null;
};

type SeasonStatPack = {
  teamStats: SeasonTeamStats;
  playerStats: SeasonPlayerStat[];
  injuryReport: SeasonInjuryReport;
  tacticalSummary: string;
  availabilitySummary: string;
};

type PlayerMetric = {
  name: string;
  position: string | null;
  role: "GK" | "DEF" | "MID" | "ATT" | "UNK";
  importance: string;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  rating: number;
  availability: number;
  note: string;
  impactScore: number;
  riskScore: number;
};

const injuryIssues = {
  minor: ["muscle tightness", "knock", "light overload", "late-season fatigue"],
  medium: ["hamstring strain", "ankle issue", "back spasm", "adductor problem"],
  major: ["knee setback", "recurring muscle injury", "long-term overload", "major soft-tissue issue"],
} as const;

export function buildSeasonStats(args: SeasonStatBuildArgs): SeasonStatPack {
  const leagueMatches = args.matchResults.filter((match) => match.competition === "bundesliga");
  const cupMatches = args.matchResults.filter((match) => match.competition !== "bundesliga");

  const leagueWins = leagueMatches.filter((match) => match.scoreFor > match.scoreAgainst).length;
  const leagueDraws = leagueMatches.filter((match) => match.scoreFor === match.scoreAgainst).length;
  const leagueLosses = Math.max(0, leagueMatches.length - leagueWins - leagueDraws);
  const goalsFor = leagueMatches.reduce((sum, match) => sum + match.scoreFor, 0);
  const goalsAgainst = leagueMatches.reduce((sum, match) => sum + match.scoreAgainst, 0);
  const xgFor = round(leagueMatches.reduce((sum, match) => sum + match.xgFor, 0));
  const xgAgainst = round(leagueMatches.reduce((sum, match) => sum + match.xgAgainst, 0));
  const cleanSheets = leagueMatches.filter((match) => match.scoreAgainst === 0).length;
  const failedToScore = leagueMatches.filter((match) => match.scoreFor === 0).length;
  const homePoints = leagueMatches.reduce((sum, match) => {
    if (!match.home) return sum;
    return sum + pointsForResult(match.scoreFor, match.scoreAgainst);
  }, 0);
  const awayPoints = leagueMatches.reduce((sum, match) => {
    if (match.home) return sum;
    return sum + pointsForResult(match.scoreFor, match.scoreAgainst);
  }, 0);
  const streaks = buildLeagueStreaks(leagueMatches);

  const teamStats: SeasonTeamStats = {
    leagueMatches: leagueMatches.length,
    leagueWins,
    leagueDraws,
    leagueLosses,
    leagueRecord: `${leagueWins}-${leagueDraws}-${leagueLosses}`,
    goalsFor,
    goalsAgainst,
    xgFor,
    xgAgainst,
    cleanSheets,
    failedToScore,
    homePoints,
    awayPoints,
    cupMatches: cupMatches.length,
    cupWins: cupMatches.filter((match) => match.scoreFor > match.scoreAgainst).length,
    cupLosses: cupMatches.filter((match) => match.scoreFor < match.scoreAgainst).length,
    averageGoalsFor: leagueMatches.length ? round(goalsFor / leagueMatches.length, 2) : 0,
    averageGoalsAgainst: leagueMatches.length ? round(goalsAgainst / leagueMatches.length, 2) : 0,
    longestUnbeaten: streaks.longestUnbeaten,
    longestWinRun: streaks.longestWinRun,
  };

  const playerMetrics = buildPlayerMetrics(args);
  const playerStats = pickPlayerStatLeaders(playerMetrics);
  const injuryReport = buildInjuryReport(args, playerMetrics);

  const tacticalSummary = buildTacticalSummary(args);
  const availabilitySummary = buildAvailabilitySummary(playerMetrics, injuryReport.events);

  return {
    teamStats,
    playerStats,
    injuryReport,
    tacticalSummary,
    availabilitySummary,
  };
}

function buildPlayerMetrics(args: SeasonStatBuildArgs): PlayerMetric[] {
  const awardSalt = stableId("season-stats", args.summary.simulation.id, args.summary.simulation.season_label);
  const lineup = Array.isArray(args.summary.lineup?.lineup_json) ? (args.summary.lineup!.lineup_json as Array<{ slot?: unknown; playerId?: unknown }>) : [];
  const lineupIds = new Set(lineup.filter((item) => typeof item.playerId === "string").map((item) => String(item.playerId)));

  return args.summary.activeRoster.map((entry) => {
    const profile = deriveRosterEntryProfile(entry);
    const importance = resolveImportance(entry);
    const selected = lineupIds.has(entry.id);
    const age = typeof entry.player.age === "number" ? entry.player.age : entry.kind === "catalog" ? entry.player.age ?? 26 : 26;
    const riskBase =
      entry.kind === "catalog"
        ? (entry.player.injury_risk ?? Math.max(14, 20 + Math.max(0, (entry.player.age ?? 26) - 29) * 1.8))
        : Math.max(16, 18 + Math.max(0, age - 29) * 1.3);
    const importanceBoost = importance === "core" ? 5.5 : importance === "starter" ? 4.4 : importance === "rotation" ? 2.9 : importance === "development" ? 1.8 : 1;
    const roleBoost = profile.role === "ATT" ? 3.4 : profile.role === "MID" ? 2.7 : profile.role === "DEF" ? 1.6 : profile.role === "GK" ? 1.2 : 0.8;
    const selectedBoost = selected ? 3.8 : 0;
    const apps = clamp(Math.round(13 + profile.rating * 0.18 + importanceBoost + roleBoost + selectedBoost + seededMetric(awardSalt, entry.id, "apps", -4, 4)), 4, 34);
    const starts = clamp(Math.round(apps * (selected ? 0.72 : importance === "core" || importance === "starter" ? 0.58 : 0.42) + seededMetric(awardSalt, entry.id, "starts", -1, 1)), 0, apps);
    const minutes = clamp(Math.round(starts * 79 + (apps - starts) * 27 + Math.max(0, roleBoost - 1) * 12), 0, 3200);
    const goals = clamp(
      Math.round(
        (profile.role === "ATT" ? 7.5 : profile.role === "MID" ? 3.5 : profile.role === "DEF" ? 0.8 : 0.2) +
          profile.rating * (profile.role === "ATT" ? 0.06 : profile.role === "MID" ? 0.03 : 0.015) +
          seededMetric(awardSalt, entry.id, "goals", -2, 2),
      ),
      0,
      profile.role === "GK" ? 0 : 36,
    );
    const assists = clamp(
      Math.round(
        (profile.role === "ATT" ? 4.2 : profile.role === "MID" ? 4.5 : profile.role === "DEF" ? 1.4 : 0.1) +
          profile.rating * (profile.role === "ATT" ? 0.04 : profile.role === "MID" ? 0.035 : 0.01) +
          seededMetric(awardSalt, entry.id, "assists", -2, 2),
      ),
      0,
      20,
    );
    const rating = Number(
      clamp(
        6.3 +
          (profile.rating - 60) * 0.016 +
          (profile.form - 60) * 0.013 +
          (selected ? 0.18 : 0) +
          (importance === "core" ? 0.14 : 0) +
          seededMetric(awardSalt, entry.id, "rating", -0.3, 0.3),
        6.0,
        8.9,
      ).toFixed(1),
    );
    const availability = clamp(
      Math.round(
        98 -
          riskBase * 0.55 -
          Math.max(0, 34 - apps) * 0.18 -
          Math.max(0, 30 - starts) * 0.12 +
          seededMetric(awardSalt, entry.id, "availability", -4, 4),
      ),
      45,
      100,
    );
    const note =
      importance === "core"
        ? "Core starter"
        : importance === "starter"
          ? "First-choice option"
          : importance === "rotation"
            ? "Rotation role"
            : importance === "development"
              ? "Development path"
              : importance === "loan_candidate"
                ? "Loan candidate"
                : importance === "sellable"
                  ? "Sellable depth"
                  : "Emergency depth";

    return {
      name: entry.player.name,
      position: entry.player.position ?? null,
      role: profile.role as PlayerMetric["role"],
      importance,
      apps,
      starts,
      minutes,
      goals,
      assists,
      rating,
      availability,
      note: `${note}${availability < 70 ? "; fitness watch" : ""}`,
      impactScore:
        goals * 5 +
        assists * 3.5 +
        apps * 0.5 +
        starts * 0.3 +
        rating * 4 +
        availability * 0.18 +
        (selected ? 10 : 0),
      riskScore: riskBase,
    };
  });
}

function pickPlayerStatLeaders(metrics: PlayerMetric[]): SeasonPlayerStat[] {
  const leaders = [
    bestBy(metrics, (item) => item.apps),
    bestBy(metrics, (item) => item.minutes),
    bestBy(metrics, (item) => item.goals),
    bestBy(metrics, (item) => item.assists),
    bestBy(metrics, (item) => item.rating),
    bestBy(metrics, (item) => item.availability),
    bestBy(metrics, (item) => item.impactScore),
  ].filter((item): item is PlayerMetric => Boolean(item));

  const unique = uniqueBy(leaders, (item) => item.name);
  const topImpact = [...metrics].sort((a, b) => b.impactScore - a.impactScore);
  for (const item of topImpact) {
    if (unique.length >= 6) break;
    if (!unique.some((candidate) => candidate.name === item.name)) {
      unique.push(item);
    }
  }

  return unique.slice(0, 6).map((item) => ({
    name: item.name,
    position: item.position,
    role: item.role,
    importance: item.importance,
    apps: item.apps,
    starts: item.starts,
    minutes: item.minutes,
    goals: item.goals,
    assists: item.assists,
    rating: item.rating,
    availability: item.availability,
    note: item.note,
  }));
}

function buildInjuryReport(args: SeasonStatBuildArgs, metrics: PlayerMetric[]): SeasonInjuryReport {
  const sorted = [...metrics].sort((a, b) => b.riskScore - a.riskScore || a.availability - b.availability);
  const targetCount = clamp(Math.round(args.derived.injuryRisk / 18), 1, 4);
  const chosen = sorted.slice(0, targetCount);
  const events = chosen.map((item, index) => {
    const severity = item.riskScore >= 58 || item.availability < 72 ? "major" : item.riskScore >= 42 || item.availability < 82 ? "medium" : "minor";
    const issuePool = injuryIssues[severity];
    const issue = issuePool[index % issuePool.length];
    const matchesOut = severity === "major" ? clamp(Math.round(item.riskScore / 11), 4, 8) : severity === "medium" ? clamp(Math.round(item.riskScore / 16), 2, 5) : clamp(Math.round(item.riskScore / 24), 1, 2);
    const note =
      severity === "major"
        ? `${item.name} had to be managed carefully as fatigue and availability risk climbed.`
        : severity === "medium"
          ? `${item.name} missed enough time to disturb rotation patterns.`
          : `${item.name} picked up a small knock but stayed broadly available.`;
    return {
      playerName: item.name,
      issue,
      severity,
      matchesOut,
      note,
    } satisfies SeasonInjuryEvent;
  });

  const summary =
    events.length > 1
      ? `${events.length} fitness problems hit the squad, with ${events[0]?.playerName} and ${events[1]?.playerName ?? "the rest"} taking the biggest workload hit.`
      : events.length === 1
        ? `${events[0]?.playerName} had the main availability wobble, but the squad mostly held together.`
        : "Availability stayed strong and the squad mostly avoided a major injury spell.";

  return { summary, events };
}

function buildTacticalSummary(args: SeasonStatBuildArgs) {
  const control = args.tacticalImpact.control;
  const threat = args.tacticalImpact.threat;
  const chemistry = args.tacticalImpact.chemistry;
  const fatigue = args.tacticalImpact.fatigue;
  const outOfPosition = args.lineupImpact.outOfPositionCount;
  const setPieceEdge = args.setPiecePlan ? args.setPiecePlan.offensiveEdge : 0;

  if (control >= 78 && threat >= 76 && chemistry >= 75) {
    return `Bayern controlled games well and kept enough threat to turn pressure into results${outOfPosition ? ", even if a few role mismatches trimmed the ceiling" : ""}.`;
  }
  if (control >= 74 && threat < 74) {
    return `Bayern kept the ball and stayed organised, but the chance creation was not quite sharp enough to make the season look bigger.`;
  }
  if (threat >= 77 && control < 74) {
    return `The team played with real attacking intent, but the control level was too uneven to dominate every match.`;
  }
  return `The tactical shape was workable, but ${fatigue >= 60 ? "fatigue" : "role balance"} and ${setPieceEdge >= 75 ? "set-piece support" : "chance control"} never quite let it settle.`;
}

function buildAvailabilitySummary(metrics: PlayerMetric[], events: SeasonInjuryEvent[]) {
  const averageAvailability = Math.round(average(metrics.map((item) => item.availability)));
  const mainNames = events.slice(0, 2).map((event) => event.playerName).filter(Boolean);
  if (mainNames.length >= 2) {
    return `Average availability stayed at ${averageAvailability}/100, but ${mainNames[0]} and ${mainNames[1]} took the biggest hits.`;
  }
  if (mainNames.length === 1) {
    return `Average availability stayed at ${averageAvailability}/100, with ${mainNames[0]} as the clearest fitness concern.`;
  }
  return `Average availability stayed at ${averageAvailability}/100 and the squad mostly avoided a serious injury spiral.`;
}

function buildLeagueStreaks(matches: SeasonMatchResult[]) {
  let currentUnbeaten = 0;
  let longestUnbeaten = 0;
  let currentWin = 0;
  let longestWinRun = 0;
  for (const match of matches) {
    const win = match.scoreFor > match.scoreAgainst;
    const draw = match.scoreFor === match.scoreAgainst;
    if (win || draw) {
      currentUnbeaten += 1;
      longestUnbeaten = Math.max(longestUnbeaten, currentUnbeaten);
    } else {
      currentUnbeaten = 0;
    }
    if (win) {
      currentWin += 1;
      longestWinRun = Math.max(longestWinRun, currentWin);
    } else {
      currentWin = 0;
    }
  }
  return { longestUnbeaten, longestWinRun };
}

function pointsForResult(scoreFor: number, scoreAgainst: number) {
  if (scoreFor > scoreAgainst) return 3;
  if (scoreFor === scoreAgainst) return 1;
  return 0;
}

function resolveImportance(entry: SimulationSummary["activeRoster"][number]) {
  if (entry.kind === "catalog") {
    return (
      entry.player.player_importance ??
      (entry.player.bayern_category === "first_team"
        ? "starter"
        : entry.player.bayern_category === "loan_return"
          ? "rotation"
          : entry.player.bayern_category === "youth"
            ? "development"
            : "sellable")
    );
  }
  const rating = Number(entry.player.rating ?? entry.player.ability ?? 78);
  if (rating >= 85) return "starter";
  if (rating >= 79) return "rotation";
  if (rating >= 73) return "development";
  return "sellable";
}

function seededMetric(seed: string, subject: string, channel: string, min: number, max: number) {
  const key = `${seed}:${subject}:${channel}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  const normalized = Math.abs(Math.sin(hash) * 10000) % 1;
  return min + (max - min) * normalized;
}

function bestBy<T>(items: T[], score: (item: T) => number) {
  let best: T | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const currentScore = score(item);
    if (best === null || currentScore > bestScore) {
      best = item;
      bestScore = currentScore;
    }
  }
  return best;
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
