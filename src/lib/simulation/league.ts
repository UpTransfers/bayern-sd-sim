import { bundesligaProjectedTable, bundesligaCupModel, pokalModel, uclTitleModel } from "../data/bayern2026";
import { bundesligaLeagueModel } from "../data/bundesliga2026";
import type { BundesligaProjectedRow, CompetitionTeamModel } from "../data/bayern2026";
import type { SeasonMatchResult, SimulationSummary, TacticalSettings } from "../types";
import { clamp } from "../utils";
import { normalizeTactics, tacticalImpact } from "./tactics";
import { deriveRosterEntryProfile } from "../football/playerModel";
import { analyzeBayernLineup } from "../football/lineupImpact";
import { buildBayernSetPiecePlan, type SetPiecePlan } from "../football/setPieces";
import { leaguePriorWeightForClub, pokalConditionalWinTarget, uclKnockoutTarget, UCL_TARGETS } from "./priors";

export type CompetitionOutcome = {
  round: string;
  score: string;
  winner: string;
  opponent?: string | null;
  rounds?: Array<{ round: string; opponent: string; score: string; result: "W" | "D" | "L"; winner?: string }>;
  matchResults?: SeasonMatchResult[];
  leaguePhasePoints?: number;
  leaguePhaseRank?: number;
  narrative?: string;
};

type LeagueTeamProfile = {
  club: string;
  rating: number;
  attack: number;
  defence: number;
  midfield: number;
  goalkeeper: number;
  pressing: number;
  possession: number;
  transition: number;
  setPiece: number;
  depth: number;
  volatility: number;
  seasonSwing: number;
  baselinePoints: number;
  baselineGoalsFor: number;
  baselineGoalsAgainst: number;
};

type LeagueTeamState = LeagueTeamProfile & {
  form: number;
  morale: number;
  fatigue: number;
  injuryLoad: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  wins: number;
  draws: number;
  losses: number;
};

type MatchOutcome = {
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
  note: string;
};

export type CompetitionSimulation = {
  table: BundesligaProjectedRow[];
  bayernRow: BundesligaProjectedRow;
  bayernPlace: number;
  notes: string[];
  matchResults: SeasonMatchResult[];
};

export function simulateBundesligaSeason(
  summary: SimulationSummary,
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number; finishPoints?: number },
  impact: ReturnType<typeof tacticalImpact>,
  runSalt = "",
): CompetitionSimulation {
  const rng = seededRng(seedFor(summary, "bundesliga", runSalt));
  const tactics = normalizeTactics(summary.simulation.tactics_json ?? null);
  const profiles = buildLeagueProfiles(summary, derived, impact, tactics, rng);
  const lineupImpact = analyzeBayernLineup(summary, tactics);
  const setPiecePlan = buildBayernSetPiecePlan(summary, tactics, lineupImpact);
  const states = new Map(profiles.map((profile) => [profile.club, toState(profile)]));
  const schedule = buildDoubleRoundRobin(profiles.map((profile) => profile.club));
  const notes: string[] = [];
  const matchResults: SeasonMatchResult[] = [];

  for (let roundIndex = 0; roundIndex < schedule.length; roundIndex += 1) {
    const round = schedule[roundIndex];
    for (const match of round) {
      const home = states.get(match.home);
      const away = states.get(match.away);
      if (!home || !away) continue;
      const outcome = simulateLeagueMatch(home, away, roundIndex, rng, summary, tactics, impact, setPiecePlan);
      if (match.home === "Bayern Munich" || match.away === "Bayern Munich") {
        const bayernHome = match.home === "Bayern Munich";
        matchResults.push({
          matchId: `bundesliga-${roundIndex + 1}-${match.home}-${match.away}`,
          competition: "bundesliga",
          round: `Matchday ${roundIndex + 1}`,
          opponent: bayernHome ? match.away : match.home,
          home: bayernHome,
          scoreFor: bayernHome ? outcome.homeGoals : outcome.awayGoals,
          scoreAgainst: bayernHome ? outcome.awayGoals : outcome.homeGoals,
          extraTime: false,
          penalties: false,
          xgFor: Number((bayernHome ? outcome.homeXg : outcome.awayXg).toFixed(2)),
          xgAgainst: Number((bayernHome ? outcome.awayXg : outcome.homeXg).toFixed(2)),
          turningPoint: outcome.note,
        });
      }
      applyMatchResult(home, away, outcome);
    }
    for (const state of states.values()) {
      state.fatigue = Math.max(0, state.fatigue - (roundIndex >= 16 ? 1.1 : 0.8));
      state.morale = clamp(state.morale * 0.92, -8, 8);
      state.injuryLoad = Math.max(0, state.injuryLoad - 0.35);
      state.form = clamp(state.form + (state.morale * 0.12) - (state.fatigue * 0.03), 38, 96);
    }
  }

  const table = calibrateLeagueTable(states, profiles, summary, derived, impact, tactics, rng)
    .sort((a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || a.club.localeCompare(b.club))
    .map<BundesligaProjectedRow>((state, index) => ({
      pos: index + 1,
      club: state.club,
      w: state.wins,
      d: state.draws,
      l: state.losses,
      gf: state.goalsFor,
      ga: state.goalsAgainst,
      gd: state.goalsFor - state.goalsAgainst,
      pts: state.points,
    }));

  const bayernRow = table.find((row) => row.club === "Bayern Munich") ?? table[0] ?? bundesligaProjectedTable[0];
  const bayernPlace = table.findIndex((row) => row.club === "Bayern Munich") + 1 || 1;
  const reconciledMatchResults = reconcileBayernLeagueMatches(matchResults, bayernRow, rng);
  notes.push(`Bundesliga race settled by ${bayernRow.pts} points and a goal difference of ${formatSigned(bayernRow.gf - bayernRow.ga)}.`);
  return { table, bayernRow, bayernPlace, notes, matchResults: reconciledMatchResults };
}

export function simulatePokalOutcome(
    summary: SimulationSummary,
    derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number },
    impact: ReturnType<typeof tacticalImpact>,
    runSalt = "",
) {
  const rng = seededRng(seedFor(summary, "pokal", runSalt));
  const tactics = normalizeTactics(summary.simulation.tactics_json ?? null);
  const lineupImpact = analyzeBayernLineup(summary, tactics);
  const setPiecePlan = buildBayernSetPiecePlan(summary, tactics, lineupImpact);
  const bayernPower = buildBayernPower(summary, derived, impact, tactics, setPiecePlan);
  const rounds = [
    { name: "Round 1", baseOpponent: 57, swing: 0.12, lowerLeague: true },
    { name: "Round 2", baseOpponent: 61, swing: 0.1, lowerLeague: true },
    { name: "Round of 16", baseOpponent: 70, swing: 0.08, lowerLeague: false },
    { name: "Quarter-final", baseOpponent: 76, swing: 0.06, lowerLeague: false },
    { name: "Semi-final", baseOpponent: 82, swing: 0.04, lowerLeague: false },
    { name: "Final", baseOpponent: 86, swing: 0.03, lowerLeague: false },
  ];

  let lastScore = "0-0";
  let lastOpponent = "Opponent";
  const path: CompetitionOutcome["rounds"] = [];
  const matchResults: SeasonMatchResult[] = [];
  for (const [index, round] of rounds.entries()) {
    const opponent = choosePokalOpponent(round, rng);
    const opponentPower = clamp(opponent.power + seededVariance(rng, -7, 7), 42, 92);
    const targetWinProbability = pokalConditionalWinTarget(index);
    const tie = simulateKnockoutTie(bayernPower, opponentPower, rng, {
      pressure: pokalModel.bayern.upset_risk_rating,
      drawDependency: pokalModel.bayern.draw_dependency_rating,
      extraTimeProbability: pokalModel.bayern.extra_time_probability,
      penaltyProbability: pokalModel.bayern.penalty_shootout_probability,
      lowerLeague: round.lowerLeague,
      riskBias: Math.max(0, derived.injuryRisk - 60) * 0.02 + impact.risk * 0.015 + lineupImpact.risk * 0.012,
      fatigueBias: impact.fatigue * 0.03 + lineupImpact.rotation * 0.015,
      setPiecePlan,
      targetWinProbability,
      targetWeight: 0.55,
    });
    lastScore = tie.score;
    lastOpponent = opponent.club;
    path.push({ round: round.name, opponent: opponent.club, score: tie.score, result: tie.bayernWon ? "W" : "L", winner: tie.bayernWon ? "Bayern Munich" : opponent.club });
    matchResults.push(
      buildKnockoutMatchResult({
        competition: "pokal",
        round: round.name,
        opponent: opponent.club,
        home: true,
        score: tie.score,
        won: tie.bayernWon,
        extraTime: tie.extraTime,
        penalties: tie.penalties,
        basePower: bayernPower,
        opponentPower,
        lowerLeague: round.lowerLeague,
      }),
    );
    if (!tie.bayernWon) {
      return {
        round: round.name,
        score: tie.score,
        winner: opponent.club,
        opponent: opponent.club,
        rounds: path,
        matchResults,
        narrative: `Bayern exited in the ${round.name.toLowerCase()} after a variance-heavy cup tie.`,
      } satisfies CompetitionOutcome;
    }
  }

  return {
    round: "Won",
    score: lastScore || "2-1",
    winner: "Bayern Munich",
    opponent: lastOpponent,
    rounds: path,
    matchResults,
    narrative: "Bayern survived the cup bracket and lifted the trophy.",
  } satisfies CompetitionOutcome;
}

export function simulateUclOutcome(
  summary: SimulationSummary,
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number; finishPoints?: number },
  impact: ReturnType<typeof tacticalImpact>,
  runSalt = "",
) {
  const rng = seededRng(seedFor(summary, "ucl", runSalt));
  const tactics = normalizeTactics(summary.simulation.tactics_json ?? null);
  const lineupImpact = analyzeBayernLineup(summary, tactics);
  const setPiecePlan = buildBayernSetPiecePlan(summary, tactics, lineupImpact);
  const bayernPower = buildBayernPower(summary, derived, impact, tactics, setPiecePlan) + 7.5;
  const pool = [...uclTitleModel];
  const leaguePhasePoints = simulateLeaguePhase(pool, "Bayern", bayernPower, rng, derived, impact, lineupImpact);
  const leaguePhaseRank = leaguePhasePoints.rank;
  const qualifiesDirectly = leaguePhaseRank <= 8;
  const reachesPlayoff = leaguePhaseRank <= 24;
  const matchResults: SeasonMatchResult[] = [];
  if (!reachesPlayoff) {
    const leaguePhaseOpponent = chooseOpponentFromPool(pool, 92, rng);
    return {
      round: "League phase",
      score: `${leaguePhasePoints.points}`,
      winner: leaguePhaseOpponent.club,
      opponent: leaguePhaseOpponent.club,
      rounds: [{ round: "League phase", opponent: leaguePhaseOpponent.club, score: `${leaguePhasePoints.points} pts`, result: "L", winner: leaguePhaseOpponent.club }],
      matchResults,
      leaguePhasePoints: leaguePhasePoints.points,
      leaguePhaseRank,
      narrative: "Bayern failed to reach the knockout phase after an uneven league phase.",
    } satisfies CompetitionOutcome;
  }

  let wonPlayoffOpponent: string | null = null;
  let wonPlayoffScore: string | null = null;
  if (!qualifiesDirectly) {
    const playoffOpponent = chooseOpponentFromPool(pool, leaguePhaseRank, rng);
    const playoffTie = simulateKnockoutTie(bayernPower, playoffOpponent.power, rng, {
      pressure: 38,
      drawDependency: 42,
      extraTimeProbability: 0.19,
      penaltyProbability: 0.09,
      lowerLeague: false,
      riskBias: Math.max(0, derived.injuryRisk - 60) * 0.018 + impact.risk * 0.014 + lineupImpact.risk * 0.01,
      fatigueBias: impact.fatigue * 0.025 + lineupImpact.rotation * 0.015,
      setPiecePlan,
      targetWinProbability: UCL_TARGETS.playoffWin,
    });
    if (!playoffTie.bayernWon) {
      return {
        round: "Playoff",
        score: playoffTie.score,
        winner: playoffOpponent.club,
        opponent: playoffOpponent.club,
        rounds: [{ round: "Playoff", opponent: playoffOpponent.club, score: playoffTie.score, result: "L", winner: playoffOpponent.club }],
        matchResults,
        leaguePhasePoints: leaguePhasePoints.points,
        leaguePhaseRank,
        narrative: "Bayern were pushed out in the playoff layer after a volatile bracket draw.",
      } satisfies CompetitionOutcome;
    }
    wonPlayoffOpponent = playoffOpponent.club;
    wonPlayoffScore = playoffTie.score;
    matchResults.push(
      buildKnockoutMatchResult({
        competition: "ucl",
        round: "Playoff",
        opponent: playoffOpponent.club,
        home: true,
        score: playoffTie.score,
        won: true,
        extraTime: playoffTie.extraTime,
        penalties: playoffTie.penalties,
        basePower: bayernPower,
        opponentPower: playoffOpponent.power,
        lowerLeague: false,
        eliteOpponent: true,
      }),
    );
  }

  const knockoutRounds = [
    { name: "Round of 16", floor: 80 },
    { name: "Quarter-final", floor: 83 },
    { name: "Semi-final", floor: 86 },
    { name: "Final", floor: 88 },
  ];

  let lastScore = "0-0";
  let lastOpponent = "Opponent";
  const path: CompetitionOutcome["rounds"] = [];
  const eliminated = new Set<string>(["Bayern", "Bayern Munich"]);
  if (!qualifiesDirectly) {
    path.push({ round: "Playoff", opponent: wonPlayoffOpponent ?? "Playoff opponent", score: wonPlayoffScore ?? "advanced", result: "W", winner: "Bayern Munich" });
    if (wonPlayoffOpponent) eliminated.add(wonPlayoffOpponent);
  }
  for (const round of knockoutRounds) {
    const opponent = drawUclOpponent(pool, round.floor, eliminated, rng);
    eliminated.add(opponent.club);
    const opponentPower = clamp(opponent.power + seededVariance(rng, -8, 8) + (round.name === "Final" ? 2 : 0), 78, 96);
    const targetWinProbability = uclKnockoutTarget(
      round.name === "Round of 16"
        ? "round16"
        : round.name === "Quarter-final"
          ? "quarter"
          : round.name === "Semi-final"
            ? "semi"
            : "final",
    );
    const tie = simulateKnockoutTie(bayernPower, opponentPower, rng, {
      pressure: uclTitleModel[0].drawDependency ?? 34,
      drawDependency: uclTitleModel[0].drawDependency ?? 34,
      extraTimeProbability: 0.22,
      penaltyProbability: 0.1,
      lowerLeague: false,
      riskBias: Math.max(0, derived.injuryRisk - 60) * 0.018 + impact.risk * 0.015 + lineupImpact.risk * 0.01,
      fatigueBias: impact.fatigue * 0.03 + lineupImpact.rotation * 0.015,
      setPiecePlan,
      eliteOpponent: true,
      targetWinProbability,
    });
    lastScore = tie.score;
    lastOpponent = opponent.club;
    path.push({ round: round.name, opponent: opponent.club, score: tie.score, result: tie.bayernWon ? "W" : "L", winner: tie.bayernWon ? "Bayern Munich" : opponent.club });
    matchResults.push(
      buildKnockoutMatchResult({
        competition: "ucl",
        round: round.name,
        opponent: opponent.club,
        home: true,
        score: tie.score,
        won: tie.bayernWon,
        extraTime: tie.extraTime,
        penalties: tie.penalties,
        basePower: bayernPower,
        opponentPower,
        lowerLeague: false,
        eliteOpponent: true,
      }),
    );
    if (!tie.bayernWon) {
      return {
        round: round.name,
        score: tie.score,
        winner: opponent.club,
        opponent: opponent.club,
        rounds: path,
        matchResults,
        leaguePhasePoints: leaguePhasePoints.points,
        leaguePhaseRank,
        narrative: `Bayern fell in the ${round.name.toLowerCase()} after a tight knockout swing.`,
      } satisfies CompetitionOutcome;
    }
  }

  return {
    round: "Won",
    score: lastScore || "2-1",
    winner: "Bayern Munich",
    opponent: lastOpponent,
    rounds: path,
    matchResults,
    leaguePhasePoints: leaguePhasePoints.points,
    leaguePhaseRank,
    narrative: "Bayern navigated the league phase and won the knockout bracket.",
  } satisfies CompetitionOutcome;
}

function buildLeagueProfiles(
  summary: SimulationSummary,
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number },
  impact: ReturnType<typeof tacticalImpact>,
  tactics: TacticalSettings,
  rng: () => number,
) {
  const leagueMap = new Map(bundesligaProjectedTable.map((row) => [row.club, row]));
  const strengthMap = new Map(bundesligaLeagueModel.map((row) => [row.club, row]));
  const cupMap = new Map(bundesligaCupModel.map((row) => [row.club, row]));
  const rosterProfiles = summary.activeRoster.map((entry) => deriveRosterEntryProfile(entry));
  const lineupImpact = analyzeBayernLineup(summary, tactics);
  const setPiecePlan = buildBayernSetPiecePlan(summary, tactics, lineupImpact);
  const squadQuality = average(rosterProfiles.map((item) => item.rating).sort((a, b) => b - a).slice(0, Math.min(14, rosterProfiles.length)));
  const startingQuality = lineupImpact.startingQuality || average(rosterProfiles.map((item) => item.rating).sort((a, b) => b - a).slice(0, Math.min(11, rosterProfiles.length)));
  const outOfPositionCount = lineupImpact.outOfPositionCount;
  const bayernBase = cupMap.get("Bayern Munich") ?? {
    club: "Bayern Munich",
    elo: 2040,
    overall: 96,
    attack: 98,
    defence: 89,
    midfield: 92,
    goalkeeper: 84,
    pressing: 88,
    possession: 96,
    transition: 83,
    setPiece: 82,
    depth: 92,
    volatility: 42,
  };

  return bundesligaProjectedTable.map<LeagueTeamProfile>((row) => {
    const model = strengthMap.get(row.club) ?? cupMap.get(row.club) ?? null;
    const base = leagueMap.get(row.club) ?? row;
    if (row.club === "Bayern Munich") {
      const seasonSwing = clamp(
        seededVariance(rng, -3.5, 7.5) +
          (lineupImpact.startingQuality - 78) * 0.12 +
          (lineupImpact.control - 70) * 0.08 +
          (lineupImpact.threat - 70) * 0.1 -
          outOfPositionCount * 0.65 +
          summary.signings.length * 0.14 -
          derived.injuryRisk * 0.03,
        -8,
        10,
      );
      const attack = clamp(
        bayernBase.attack +
          (squadQuality - 78) * 0.28 +
          (startingQuality - 78) * 0.42 +
          (derived.tactical - 70) * 0.08 +
          impact.threat * 0.12 +
          lineupImpact.threat * 0.07 -
          outOfPositionCount * 0.8 +
          (lineupImpact.benchQuality - 74) * 0.05 +
          (setPiecePlan.offensiveEdge - 68) * 0.04,
        86,
        99,
      );
      const defence = clamp(
        bayernBase.defence +
          (lineupImpact.defence - 74) * 0.28 +
          (startingQuality - 78) * 0.16 +
          (impact.control - 50) * 0.08 -
          (impact.risk * 0.1) -
          (derived.injuryRisk - 50) * 0.04 -
          outOfPositionCount * 0.7 +
          (lineupImpact.benchQuality - 74) * 0.035,
        82,
        98,
      );
      const midfield = clamp(
        bayernBase.midfield +
          (lineupImpact.midfield - 74) * 0.3 +
          (startingQuality - 78) * 0.16 +
          (derived.squadBalance - 70) * 0.06 +
          impact.control * 0.08 +
          lineupImpact.control * 0.04 +
          (lineupImpact.benchQuality - 74) * 0.04,
        83,
        99,
      );
      const goalkeeper = clamp(bayernBase.goalkeeper + (lineupImpact.goalkeeper - 74) * 0.14 + (derived.squadBalance - 70) * 0.03, 80, 95);
      const depth = clamp(
        bayernBase.depth +
          summary.activeRoster.length * 0.16 +
          summary.signings.length * 0.9 -
          summary.soldPlayerIds.length * 0.8 +
          lineupImpact.depth * 0.08 +
          (lineupImpact.benchQuality - 74) * 0.12 +
          (derived.budgetEfficiency - 55) * 0.04,
        82,
        99,
      );
      const volatility = clamp(
        bayernBase.volatility +
          (derived.injuryRisk - 45) * 0.45 +
          impact.risk * 0.22 -
          tactics.rotationLevel * 0.14 +
          outOfPositionCount * 2 +
          lineupImpact.risk * 0.18,
        20,
        58,
      );
      const rating = clamp(Math.round((attack + defence + midfield + goalkeeper + depth) / 5), 90, 99);
      return {
        club: row.club,
        rating,
        attack,
        defence,
        midfield,
        goalkeeper,
        pressing: clamp(
          Math.round(
            (bayernBase.pressing + impact.control * 0.08 + impact.risk * 0.06 + tactics.pressingIntensity * 0.12 + lineupImpact.control * 0.04) / 1.15,
          ),
          82,
          99,
        ),
        possession: clamp(
          Math.round((bayernBase.possession + impact.control * 0.09 + tactics.buildUpSpeed * 0.1 + lineupImpact.control * 0.05 + lineupImpact.chemistry * 0.03) / 1.08),
          86,
          99,
        ),
        transition: clamp(
          Math.round((bayernBase.transition + impact.threat * 0.07 + tactics.ballsInBehindRisk * 0.08 + lineupImpact.threat * 0.05) / 1.05),
          80,
          99,
        ),
        setPiece: clamp(
          Math.round(
            (bayernBase.setPiece + squadQuality * 0.04 + summary.signings.length * 0.3 + lineupImpact.width * 0.02 + setPiecePlan.setPieceRating * 0.06 + setPiecePlan.captainInfluence * 0.03) /
              1.02,
          ),
          78,
          96,
        ),
        depth,
        volatility,
        seasonSwing,
        baselinePoints: row.pts,
        baselineGoalsFor: row.gf,
        baselineGoalsAgainst: row.ga,
      };
    }

    const attackBase = model?.attack ?? deriveAttack(base);
    const defenceBase = model?.defence ?? deriveDefence(base);
    const midfieldBase = model?.midfield ?? deriveMidfield(base);
    const goalkeeperBase = model?.goalkeeper ?? deriveGoalkeeper(base);
    const pressingBase = model?.pressing ?? clamp(48 + row.pos * 0.6, 48, 88);
    const possessionBase = model?.possession ?? clamp(49 + row.pts * 0.22, 48, 90);
    const transitionBase = model?.transition ?? clamp(50 + (row.gf - row.ga) * 0.4, 46, 88);
    const setPieceBase = model?.setPiece ?? clamp(47 + (row.pts - 35) * 0.2, 45, 86);
    const depthBase = model?.depth ?? clamp(49 + row.pts * 0.22, 45, 90);
    const volatilityBase = model?.volatility ?? clamp(24 + (19 - row.pos) * 1.5, 18, 68);
    const rating = model?.overall ?? clamp(Math.round((attackBase + defenceBase + midfieldBase + goalkeeperBase + depthBase) / 5), 48, 88);
    const seasonSwing = clamp(seededVariance(rng, -5.8, 5.8) + (rating - 72) * 0.03 - (volatilityBase - 30) * 0.02, -9, 9);

    return {
      club: row.club,
      rating,
      attack: attackBase,
      defence: defenceBase,
      midfield: midfieldBase,
      goalkeeper: goalkeeperBase,
      pressing: pressingBase,
      possession: possessionBase,
      transition: transitionBase,
      setPiece: setPieceBase,
      depth: depthBase,
      volatility: volatilityBase,
      seasonSwing,
      baselinePoints: row.pts,
      baselineGoalsFor: row.gf,
      baselineGoalsAgainst: row.ga,
    };
  });
}

function calibrateLeagueTable(
  states: Map<string, LeagueTeamState>,
  profiles: LeagueTeamProfile[],
  summary: SimulationSummary,
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number; finishPoints?: number },
  impact: ReturnType<typeof tacticalImpact>,
  tactics: TacticalSettings,
  rng: () => number,
) {
  const priorRows = new Map(bundesligaProjectedTable.map((row) => [row.club, row]));
  const lineupImpact = analyzeBayernLineup(summary, tactics);
  const profileMap = new Map(profiles.map((profile) => [profile.club, profile]));
  return [...states.values()].map((state) => {
    const prior = priorRows.get(state.club) ?? bundesligaProjectedTable[0];
    const profile = profileMap.get(state.club) ?? state;
    const priorWeight = clamp(leaguePriorWeightForClub(state.club, state.volatility) * 0.38, 0.16, 0.42);
    const rawWeight = 1 - priorWeight;
    const volatilityFactor = clamp((state.volatility + Math.abs(state.seasonSwing) * 2.2) / 72, 0.36, 1);
    const blendNoise = seededVariance(rng, -1.8, 1.8) * volatilityFactor;
    const isBayern = state.club === "Bayern Munich";

    const tacticalPoints =
      isBayern
        ? (lineupImpact.startingQuality - 78) * 0.22 +
          (lineupImpact.control - 70) * 0.18 +
          (lineupImpact.threat - 70) * 0.16 +
          (lineupImpact.chemistry - 72) * 0.08 -
          lineupImpact.outOfPositionCount * 1.35 -
          derived.injuryRisk * 0.04 -
          impact.risk * 0.05 +
          summary.signings.length * 0.22
        : 0;

    let points: number;
    let wins: number;
    let draws: number;
    let losses: number;
    let goalsFor: number;
    let goalsAgainst: number;

    if (isBayern) {
      const eliteBase = clamp(
        Math.round(
          82 +
            ((derived.finishPoints ?? 78) - 78) * 0.35 +
            (lineupImpact.startingQuality - 80) * 0.42 +
            (lineupImpact.control - 70) * 0.16 +
            (lineupImpact.threat - 70) * 0.14 +
            (lineupImpact.chemistry - 72) * 0.08 +
            (lineupImpact.benchQuality - 74) * 0.08 +
            state.seasonSwing * 0.4 -
            lineupImpact.outOfPositionCount * 0.38 -
            derived.injuryRisk * 0.06 -
            impact.risk * 0.05 +
            summary.signings.length * 0.2 +
            blendNoise * 4.4,
        ),
        70,
        91,
      );
      const pointFloor = clamp(
        Math.round(
          72 +
            (lineupImpact.startingQuality - 78) * 0.22 +
            (lineupImpact.benchQuality - 74) * 0.08 -
            lineupImpact.outOfPositionCount * 1.4 -
            derived.injuryRisk * 0.05,
        ),
        68,
        80,
      );
      const pointTarget = clamp(Math.round(eliteBase + (state.points - prior.pts) * 0.04 + seededVariance(rng, -4.6, 5.2)), pointFloor, 93);
      draws = clamp(Math.round(state.draws * 0.58 + prior.d * 0.18 + blendNoise * 0.65), 2, 13);
      wins = clamp(Math.round((pointTarget - draws) / 3), 20, 33);
      points = wins * 3 + draws;
      goalsAgainst = clamp(
        Math.round(27 + (84 - pointTarget) * 0.82 + (lineupImpact.risk - 68) * 0.2 + blendNoise * 1.6),
        18,
        48,
      );
      goalsFor = clamp(Math.round(72 + (pointTarget - 72) * 1.08 + (lineupImpact.threat - 72) * 0.28 + blendNoise * 2.4), 64, 118);
      losses = Math.max(0, 34 - wins - draws);
    } else {
    let pointTarget = clamp(
      Math.round(prior.pts * priorWeight + state.points * rawWeight + tacticalPoints + state.seasonSwing * 0.18 + blendNoise * 2),
      18,
      90,
    );
    const topSixCap = prior.pos <= 2 ? prior.pts + 5 : prior.pos <= 4 ? prior.pts + 6 : prior.pos <= 6 ? prior.pts + 4 : prior.pts + 9;
    const floor = prior.pos <= 6 ? prior.pts - 14 : prior.pts - 16;
    const priorBlend = prior.pos <= 3 ? 0.42 : prior.pos <= 6 ? 0.3 : 0.22;
    const tierDrag = prior.pos <= 2 ? 0 : prior.pos <= 4 ? 2 : prior.pos <= 6 ? 4 : 5;
    pointTarget = clamp(Math.round(pointTarget * (1 - priorBlend) + prior.pts * priorBlend - tierDrag + Math.max(-3, Math.min(3, profile.rating - 74) * 0.08)), floor, topSixCap);
      const drawTarget = clamp(Math.round(prior.d * priorWeight + state.draws * rawWeight + blendNoise * 0.6), 2, 16);
      wins = clamp(Math.round((pointTarget - drawTarget) / 3), 0, 34);
      draws = clamp(drawTarget, 0, Math.max(0, 34 - wins));
      losses = Math.max(0, 34 - wins - draws);
      points = wins * 3 + draws;
      const goalDiffTarget = clamp(
        Math.round((prior.gd * priorWeight + (state.goalsFor - state.goalsAgainst) * rawWeight) + state.seasonSwing * 0.25 + blendNoise * 2.4),
        -40,
        72,
      );
      goalsFor = clamp(Math.round(prior.gf * priorWeight + state.goalsFor * rawWeight + state.seasonSwing * 0.3 + blendNoise * 1.8), 22, 122);
      goalsAgainst = clamp(Math.round(goalsFor - goalDiffTarget), 15, 108);
    }

    return {
      ...profile,
      form: clamp(state.form + (points - prior.pts) * 0.18 + blendNoise * 2, 40, 98),
      morale: clamp(state.morale + (points - prior.pts) * 0.05, -8, 8),
      fatigue: state.fatigue,
      injuryLoad: state.injuryLoad,
      points,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
    };
  });
}

function simulateLeagueMatch(
  home: LeagueTeamState,
  away: LeagueTeamState,
  roundIndex: number,
  rng: () => number,
  summary: SimulationSummary,
  tactics: TacticalSettings,
  impact: ReturnType<typeof tacticalImpact>,
  setPiecePlan: SetPiecePlan,
): MatchOutcome {
  const seasonPressure = roundIndex < 10 ? 0.15 : roundIndex < 22 ? 0.35 : 0.58;
  const homeAdvantage = 0.18 + (home.volatility < away.volatility ? 0.03 : 0);
  const homeControl = home.possession * 0.07 + home.midfield * 0.08 + home.setPiece * 0.015;
  const awayControl = away.possession * 0.07 + away.midfield * 0.08 + away.setPiece * 0.015;
  const homeAttack = home.attack * 0.16 + home.transition * 0.08 + home.pressing * 0.03 + home.form * 0.11;
  const awayAttack = away.attack * 0.16 + away.transition * 0.08 + away.pressing * 0.03 + away.form * 0.11;
  const homeDefence = home.defence * 0.11 + home.goalkeeper * 0.07 + home.depth * 0.02 + home.form * 0.025;
  const awayDefence = away.defence * 0.11 + away.goalkeeper * 0.07 + away.depth * 0.02 + away.form * 0.025;
  const homeFatiguePenalty = home.fatigue * 0.025 + home.injuryLoad * 0.16;
  const awayFatiguePenalty = away.fatigue * 0.025 + away.injuryLoad * 0.16;
  const homeMomentum = home.morale * 0.03 + (home.form - away.form) * 0.009;
  const awayMomentum = away.morale * 0.03 + (away.form - home.form) * 0.009;
  const homeQualityEdge = (home.rating - away.rating) * 0.019 + (home.seasonSwing - away.seasonSwing) * 0.017;
  const awayQualityEdge = (away.rating - home.rating) * 0.019 + (away.seasonSwing - home.seasonSwing) * 0.017;
  const tacticalHome = home.club === "Bayern Munich" ? impact : { control: 0, threat: 0, risk: 0, fatigue: 0, chemistry: 0 };
  const tacticalAway = away.club === "Bayern Munich" ? impact : { control: 0, threat: 0, risk: 0, fatigue: 0, chemistry: 0 };
  const tacticalRisk = home.club === "Bayern Munich" ? (tactics.ballsInBehindRisk * 0.003 + tactics.pressingIntensity * 0.002) : 0;
  const tacticalAwayRisk = away.club === "Bayern Munich" ? (tactics.ballsInBehindRisk * 0.003 + tactics.pressingIntensity * 0.002) : 0;
  const tacticalControl = home.club === "Bayern Munich" ? tacticalHome.control * 0.008 : 0;
  const tacticalAwayControl = away.club === "Bayern Munich" ? tacticalAway.control * 0.008 : 0;
  const bayernSetPieceEdge = clamp((setPiecePlan.setPieceRating - 72) * 0.006 + (setPiecePlan.captainInfluence - 70) * 0.003 + (setPiecePlan.offensiveEdge - 66) * 0.0025, -0.08, 0.28);
  const bayernSetPieceFinishing = clamp((setPiecePlan.penaltyEdge - 66) * 0.0022 + (setPiecePlan.cornerTaker.score - 70) * 0.0014, -0.04, 0.14);
  const styleHomeEdge =
    (home.pressing - away.possession) * 0.0018 +
    (home.transition - away.transition) * 0.0014 +
    (home.setPiece - away.setPiece) * 0.0008;
  const styleAwayEdge =
    (away.pressing - home.possession) * 0.0018 +
    (away.transition - home.transition) * 0.0014 +
    (away.setPiece - home.setPiece) * 0.0008;
  const bayernHomeBias = home.club === "Bayern Munich" ? 0.42 : 0;
  const bayernAwayBias = away.club === "Bayern Munich" ? 0.42 : 0;

  const homeXg = clamp(
    1.08 +
      homeAdvantage +
      homeQualityEdge +
      (homeAttack - awayDefence) * 0.03 +
      (homeControl - awayControl) * 0.02 +
      homeMomentum +
      styleHomeEdge * 0.9 +
      bayernHomeBias -
      bayernAwayBias * 0.05 +
      tacticalControl -
      tacticalRisk +
      (home.club === "Bayern Munich" ? bayernSetPieceEdge + bayernSetPieceFinishing : 0) -
      awayFatiguePenalty * 0.16 -
      homeFatiguePenalty * 0.2 +
      seededVariance(rng, -0.48, 0.48) +
      seasonPressure * 0.05,
    0.2,
    4.5,
  );
  const awayXg = clamp(
    0.98 -
      homeAdvantage * 0.18 +
      awayQualityEdge +
      (awayAttack - homeDefence) * 0.029 +
      (awayControl - homeControl) * 0.017 +
      awayMomentum +
      styleAwayEdge * 0.88 +
      bayernAwayBias -
      bayernHomeBias * 0.05 +
      tacticalAwayControl -
      tacticalAwayRisk +
      (away.club === "Bayern Munich" ? bayernSetPieceEdge + bayernSetPieceFinishing : 0) -
      homeFatiguePenalty * 0.16 -
      awayFatiguePenalty * 0.18 +
      seededVariance(rng, -0.44, 0.44) +
      seasonPressure * 0.03,
    0.1,
    4.0,
  );

  const homeGoals = Math.min(samplePoisson(homeXg, rng), 7);
  const awayGoals = Math.min(samplePoisson(awayXg * 0.96, rng), 6);
  return {
    homeGoals,
    awayGoals,
    homeXg,
    awayXg,
    note: homeGoals > awayGoals ? "Home advantage held" : awayGoals > homeGoals ? "Away side struck back" : "Draw settled the balance",
  };
}

function applyMatchResult(home: LeagueTeamState, away: LeagueTeamState, outcome: MatchOutcome) {
  home.goalsFor += outcome.homeGoals;
  home.goalsAgainst += outcome.awayGoals;
  away.goalsFor += outcome.awayGoals;
  away.goalsAgainst += outcome.homeGoals;

  if (outcome.homeGoals > outcome.awayGoals) {
    home.points += 3;
    home.wins += 1;
    away.losses += 1;
    home.morale += 1.9;
    away.morale -= 1.6;
  } else if (outcome.homeGoals < outcome.awayGoals) {
    away.points += 3;
    away.wins += 1;
    home.losses += 1;
    away.morale += 1.9;
    home.morale -= 1.6;
  } else {
    home.points += 1;
    away.points += 1;
    home.draws += 1;
    away.draws += 1;
    home.morale += 0.5;
    away.morale += 0.5;
  }

  const homeLoad = (home.pressing * 0.008 + home.transition * 0.006 + home.volatility * 0.004);
  const awayLoad = (away.pressing * 0.008 + away.transition * 0.006 + away.volatility * 0.004);
  home.fatigue = clamp(home.fatigue + homeLoad + (home.club === "Bayern Munich" ? 0.35 : 0.1), 0, 24);
  away.fatigue = clamp(away.fatigue + awayLoad + (away.club === "Bayern Munich" ? 0.35 : 0.1), 0, 24);

  if (home.fatigue > 10 && seededVariance(seedlessRng(home.club, away.club, outcome.homeGoals, outcome.awayGoals), 0, 1) > 0.82) {
    home.injuryLoad = clamp(home.injuryLoad + 0.4, 0, 6);
  }
  if (away.fatigue > 10 && seededVariance(seedlessRng(away.club, home.club, outcome.awayGoals, outcome.homeGoals), 0, 1) > 0.82) {
    away.injuryLoad = clamp(away.injuryLoad + 0.4, 0, 6);
  }

  home.form = clamp(home.form + (outcome.homeGoals - outcome.awayGoals) * 1.1 + home.morale * 0.06, 36, 96);
  away.form = clamp(away.form + (outcome.awayGoals - outcome.homeGoals) * 1.1 + away.morale * 0.06, 36, 96);
}

function reconcileBayernLeagueMatches(
  matches: SeasonMatchResult[],
  bayernRow: Pick<BundesligaProjectedRow, "w" | "d" | "l" | "gf" | "ga">,
  rng: () => number,
) {
  const leagueMatches = matches.filter((match) => match.competition === "bundesliga");
  if (leagueMatches.length !== 34) return matches;

  const ranked = [...leagueMatches]
    .map((match, index) => ({
      match,
      index,
      score: match.scoreFor - match.scoreAgainst + match.xgFor - match.xgAgainst + seededVariance(rng, -0.35, 0.35),
    }))
    .sort((a, b) => b.score - a.score);

  const outcomeById = new Map<string, "W" | "D" | "L">();
  ranked.forEach((entry, index) => {
    if (index < bayernRow.w) outcomeById.set(entry.match.matchId, "W");
    else if (index < bayernRow.w + bayernRow.d) outcomeById.set(entry.match.matchId, "D");
    else outcomeById.set(entry.match.matchId, "L");
  });

  const adjusted = leagueMatches.map((match) => {
    const outcome = outcomeById.get(match.matchId) ?? "D";
    const profile = makeScoreForOutcome(outcome, rng);
    return {
      ...match,
      scoreFor: profile.scoreFor,
      scoreAgainst: profile.scoreAgainst,
      xgFor: Number(clamp(profile.scoreFor + seededVariance(rng, -0.45, 0.65), 0.15, 4.9).toFixed(2)),
      xgAgainst: Number(clamp(profile.scoreAgainst + seededVariance(rng, -0.4, 0.55), 0.05, 4.4).toFixed(2)),
      turningPoint: outcome === "W" ? winTurningPoint(rng) : outcome === "D" ? drawTurningPoint(rng) : lossTurningPoint(rng),
    };
  });

  fitGoalTotals(adjusted, bayernRow.gf, bayernRow.ga, rng);
  const byId = new Map(adjusted.map((match) => [match.matchId, match]));
  return matches.map((match) => byId.get(match.matchId) ?? match);
}

function makeScoreForOutcome(outcome: "W" | "D" | "L", rng: () => number) {
  if (outcome === "W") {
    const scoreAgainst = weightedPick([0, 0, 1, 1, 1, 2], rng);
    const scoreFor = scoreAgainst + weightedPick([1, 2, 2, 2, 3, 3, 4], rng);
    return { scoreFor, scoreAgainst };
  }
  if (outcome === "D") {
    const goals = weightedPick([0, 1, 1, 1, 2, 2, 3], rng);
    return { scoreFor: goals, scoreAgainst: goals };
  }
  const scoreFor = weightedPick([0, 0, 1, 1, 1, 2], rng);
  const scoreAgainst = scoreFor + weightedPick([1, 1, 2, 2, 3], rng);
  return { scoreFor, scoreAgainst };
}

function fitGoalTotals(matches: SeasonMatchResult[], targetFor: number, targetAgainst: number, rng: () => number) {
  let guard = 0;
  while (sumGoals(matches, "scoreFor") < targetFor && guard < 500) {
    guard += 1;
    const match = pickAdjustable(matches, "addFor", rng);
    if (!match) break;
    match.scoreFor += 1;
    match.xgFor = Number(clamp(match.xgFor + 0.42, 0.15, 5.4).toFixed(2));
  }
  while (sumGoals(matches, "scoreFor") > targetFor && guard < 1000) {
    guard += 1;
    const match = pickAdjustable(matches, "removeFor", rng);
    if (!match) break;
    match.scoreFor -= 1;
    match.xgFor = Number(clamp(match.xgFor - 0.34, 0.15, 5.4).toFixed(2));
  }
  while (sumGoals(matches, "scoreAgainst") < targetAgainst && guard < 1500) {
    guard += 1;
    const match = pickAdjustable(matches, "addAgainst", rng);
    if (!match) break;
    match.scoreAgainst += 1;
    match.xgAgainst = Number(clamp(match.xgAgainst + 0.38, 0.05, 4.9).toFixed(2));
  }
  while (sumGoals(matches, "scoreAgainst") > targetAgainst && guard < 2000) {
    guard += 1;
    const match = pickAdjustable(matches, "removeAgainst", rng);
    if (!match) break;
    match.scoreAgainst -= 1;
    match.xgAgainst = Number(clamp(match.xgAgainst - 0.3, 0.05, 4.9).toFixed(2));
  }
}

function pickAdjustable(matches: SeasonMatchResult[], mode: "addFor" | "removeFor" | "addAgainst" | "removeAgainst", rng: () => number) {
  const candidates = matches.filter((match) => {
    const win = match.scoreFor > match.scoreAgainst;
    const loss = match.scoreFor < match.scoreAgainst;
    if (mode === "addFor") return win || (loss && match.scoreFor + 1 < match.scoreAgainst);
    if (mode === "removeFor") return (win && match.scoreFor - 1 > match.scoreAgainst && match.scoreFor > 1) || (loss && match.scoreFor > 0);
    if (mode === "addAgainst") return loss || (win && match.scoreAgainst + 1 < match.scoreFor);
    return (win && match.scoreAgainst > 0) || (loss && match.scoreAgainst - 1 > match.scoreFor && match.scoreAgainst > 1);
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0] ?? null;
}

function sumGoals(matches: SeasonMatchResult[], key: "scoreFor" | "scoreAgainst") {
  return matches.reduce((sum, match) => sum + match[key], 0);
}

function weightedPick(values: number[], rng: () => number) {
  return values[Math.floor(rng() * values.length)] ?? values[0] ?? 0;
}

function winTurningPoint(rng: () => number) {
  return weightedText(["Early pressure turned into control", "Bench quality finished the game", "Set-piece edge changed the rhythm", "Second-half control decided it"], rng);
}

function drawTurningPoint(rng: () => number) {
  return weightedText(["Late pressure was not enough", "Control did not become a winner", "Opponent survived the final spell", "Rotation made the rhythm uneven"], rng);
}

function lossTurningPoint(rng: () => number) {
  return weightedText(["Transition defence cracked", "Missed chances became expensive", "A tired spell decided it", "Opponent punished the open structure"], rng);
}

function weightedText(values: string[], rng: () => number) {
  return values[Math.floor(rng() * values.length)] ?? values[0] ?? "Match swung on details";
}

function toState(profile: LeagueTeamProfile): LeagueTeamState {
  return {
    ...profile,
    form: clamp(profile.rating + profile.seasonSwing * 0.7 + seededVariance(seedlessRng(profile.club, profile.baselinePoints), -5.5, 5.5), 40, 98),
    morale: clamp(profile.seasonSwing * 0.18, -8, 8),
    fatigue: 0,
    injuryLoad: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    wins: 0,
    draws: 0,
    losses: 0,
  };
}

function buildBayernPower(
  summary: SimulationSummary,
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number },
  impact: ReturnType<typeof tacticalImpact>,
  tactics: TacticalSettings,
  setPiecePlan: SetPiecePlan,
) {
  const rosterProfiles = summary.activeRoster.map((entry) => deriveRosterEntryProfile(entry));
  const squadQuality = average(rosterProfiles.map((item) => item.rating).sort((a, b) => b - a).slice(0, Math.min(14, rosterProfiles.length)));
  const lineupImpact = analyzeBayernLineup(summary, tactics);
  const startingQuality = lineupImpact.startingQuality || average(rosterProfiles.map((item) => item.rating).sort((a, b) => b - a).slice(0, Math.min(11, rosterProfiles.length)));
  const lineupPenalty = lineupImpact.outOfPositionCount * 1.35 + Math.max(0, 72 - lineupImpact.chemistry) * 0.16;
  const signingsBoost = summary.signings.reduce((sum, signing) => {
    const approval = signing.raw_json && typeof signing.raw_json === "object" ? (signing.raw_json as { approval?: { total?: number } }).approval : null;
    const approvalBonus = typeof approval?.total === "number" ? Math.round(approval.total / 30) : 0;
    return sum + signing.tactical_fit_score * 0.03 + signing.squad_need_score * 0.01 + approvalBonus;
  }, 0);
  return clamp(
    84 +
      (squadQuality - 76) * 0.28 +
      (startingQuality - 78) * 0.58 +
      lineupImpact.attack * 0.11 +
      lineupImpact.control * 0.1 +
      lineupImpact.chemistry * 0.06 +
      lineupImpact.benchQuality * 0.045 +
      lineupImpact.depth * 0.035 +
      setPiecePlan.setPieceRating * 0.12 +
      setPiecePlan.captainInfluence * 0.05 +
      derived.tactical * 0.08 +
      impact.control * 0.06 +
      signingsBoost * 1.1 -
      derived.injuryRisk * 0.05 -
      lineupPenalty +
      tactics.rotationLevel * 0.02,
    78,
    100,
  );
}

function simulateKnockoutTie(
  bayernPower: number,
  opponentPower: number,
  rng: () => number,
  context: {
    pressure: number;
    drawDependency: number;
    extraTimeProbability: number;
    penaltyProbability: number;
    lowerLeague: boolean;
    riskBias: number;
    fatigueBias: number;
    eliteOpponent?: boolean;
    targetWinProbability?: number;
    targetWeight?: number;
    setPiecePlan?: SetPiecePlan;
  },
) {
  const pressureVolatility = (context.pressure - 50) * 0.006;
  const drawVolatility = (context.drawDependency - 50) * 0.008;
  const setPieceBoost = context.setPiecePlan ? clamp((context.setPiecePlan.setPieceRating - 70) * 0.0045 + (context.setPiecePlan.captainInfluence - 68) * 0.0025, -0.05, 0.22) : 0;
  const shootoutEdge = context.setPiecePlan ? clamp((context.setPiecePlan.penaltyEdge - 68) * 0.003, -0.03, 0.16) : 0;
  const swing =
    (bayernPower - opponentPower) / 6.8 +
    (context.lowerLeague ? 1.6 : 0) -
    context.riskBias * 0.65 -
    context.fatigueBias * 0.5 +
    pressureVolatility -
    drawVolatility +
    setPieceBoost +
    seededVariance(rng, -1.15, 1.15);
  const winProb = clamp(1 / (1 + Math.exp(-swing)), 0.06, 0.98);
  const targetWinProbability = typeof context.targetWinProbability === "number" ? context.targetWinProbability : winProb;
  const targetWeight = context.targetWeight ?? 0.4;
  const blendedWinProb = clamp(winProb * (1 - targetWeight) + targetWinProbability * targetWeight, 0.06, 0.98);
  const bayernWon = rng() < blendedWinProb;
  const baseBayernXg = clamp(
    1.1 +
      (bayernPower - opponentPower) / 9.8 +
      (context.lowerLeague ? 0.4 : 0) -
      context.riskBias * 0.05 -
      context.fatigueBias * 0.06 +
      pressureVolatility * 0.42 +
      (blendedWinProb - 0.5) * 0.8 +
      setPieceBoost * 0.9,
    0.55,
    4.0,
  );
  const baseOpponentXg = clamp(
    0.98 -
      (bayernPower - opponentPower) / 12.8 +
      context.riskBias * 0.1 +
      context.fatigueBias * 0.09 +
      drawVolatility * 0.28 +
      (0.5 - blendedWinProb) * 0.38 +
      (context.lowerLeague ? 0.14 : 0),
    0.28,
    3.3,
  );
  let homeScore = Math.min(samplePoisson(baseBayernXg, rng), context.lowerLeague ? 6 : 5);
  let awayScore = Math.min(samplePoisson(baseOpponentXg, rng), context.eliteOpponent ? 5 : 4);
  let extraTime = false;
  let penalties = false;

  if (homeScore === awayScore) {
    extraTime = rng() < context.extraTimeProbability || Math.abs(swing) < 0.8;
    if (extraTime) {
      homeScore += samplePoisson(clamp(0.26 + Math.max(0, swing) * 0.05, 0.12, 0.58), rng);
      awayScore += samplePoisson(clamp(0.22 + Math.max(0, -swing) * 0.04, 0.1, 0.5), rng);
    }
    if (homeScore === awayScore && rng() < context.penaltyProbability) {
      penalties = true;
      const shootoutSwing = swing + shootoutEdge + seededVariance(rng, -0.65, 0.65);
      const bayernShootout = rng() < clamp(0.5 + shootoutSwing * 0.1, 0.15, 0.85);
      if (bayernShootout) {
        homeScore += 1;
      } else {
        awayScore += 1;
      }
    }
  }

  if (bayernWon && homeScore <= awayScore) {
    awayScore = Math.max(0, homeScore - 1);
    if (homeScore <= awayScore) homeScore = awayScore + 1;
  }
  if (!bayernWon && awayScore <= homeScore) {
    homeScore = Math.max(0, awayScore - 1);
    if (awayScore <= homeScore) awayScore = homeScore + 1;
  }
  if (!bayernWon && homeScore === 0 && baseBayernXg > 1.2 && rng() < 0.65) {
    homeScore = 1;
    awayScore = Math.max(2, awayScore);
  }
  if (bayernWon && context.lowerLeague && awayScore === 0 && rng() < 0.72) {
    awayScore = 1;
  }
  if (homeScore + awayScore <= 1 && rng() < 0.62) {
    if (bayernWon) {
      awayScore = Math.max(1, awayScore);
    } else {
      homeScore = Math.max(1, homeScore);
    }
  }

  const score = penalties ? `${homeScore}-${awayScore} (pens)` : extraTime ? `${homeScore}-${awayScore} a.e.t.` : `${homeScore}-${awayScore}`;
  return {
    bayernWon,
    score,
    extraTime,
    penalties,
  };
}

function buildKnockoutMatchResult(input: {
  competition: SeasonMatchResult["competition"];
  round: string;
  opponent: string;
  home: boolean;
  score: string;
  won: boolean;
  extraTime: boolean;
  penalties: boolean;
  basePower: number;
  opponentPower: number;
  lowerLeague: boolean;
  eliteOpponent?: boolean;
}): SeasonMatchResult {
  const scoreMatch = input.score.match(/^(\d+)-(\d+)/);
  const scoreFor = scoreMatch ? Number(scoreMatch[1]) : input.won ? 2 : 1;
  const scoreAgainst = scoreMatch ? Number(scoreMatch[2]) : input.won ? 1 : 2;
  const powerEdge = (input.basePower - input.opponentPower) / 12;
  const xgFor = clamp(scoreFor + 0.35 + Math.max(0, powerEdge) * 0.18 + (input.lowerLeague ? 0.2 : 0), 0.4, 4.5);
  const xgAgainst = clamp(scoreAgainst + 0.28 + Math.max(0, -powerEdge) * 0.14 + (input.eliteOpponent ? 0.12 : 0), 0.3, 4.0);
  return {
    matchId: `${input.competition}-${input.round}-${input.opponent}`.replace(/\s+/g, "-").toLowerCase(),
    competition: input.competition,
    round: input.round,
    opponent: input.opponent,
    home: input.home,
    scoreFor,
    scoreAgainst,
    extraTime: input.extraTime,
    penalties: input.penalties,
    xgFor: Number(xgFor.toFixed(2)),
    xgAgainst: Number(xgAgainst.toFixed(2)),
    turningPoint: input.won ? "Bayern controlled the tie" : "Bayern lost the knockout swing",
  };
}

function simulateLeaguePhase(
  pool: CompetitionTeamModel[],
  bayernClub: string,
  bayernPower: number,
  rng: () => number,
  derived: { tactical: number; injuryRisk: number; squadBalance: number; budgetEfficiency: number },
  impact: ReturnType<typeof tacticalImpact>,
  lineupImpact: ReturnType<typeof analyzeBayernLineup>,
) {
  const directChance = clamp(
    UCL_TARGETS.top8 +
      (lineupImpact.control - 70) * 0.0018 +
      (lineupImpact.chemistry - 72) * 0.001 -
      lineupImpact.outOfPositionCount * 0.012 -
      derived.injuryRisk * 0.0008 +
      (bayernPower - 95) * 0.004 +
      (bayernClub.includes("Bayern") ? 0.008 : 0),
    0.62,
    0.86,
  );
  const top24Chance = clamp(UCL_TARGETS.top24 - lineupImpact.outOfPositionCount * 0.004, 0.96, 0.999);
  const roll = rng();
  if (roll < directChance) {
    const points = clamp(Math.round(18.4 + seededVariance(rng, -2.2, 2.2) + impact.control * 0.03 - impact.risk * 0.02 - derived.injuryRisk * 0.03), 15, 24);
    const rank = clamp(Math.round(3.1 + seededVariance(rng, -2.4, 2.4)), 1, 8);
    return { points, rank };
  }
  if (roll < top24Chance) {
    const points = clamp(Math.round(15.8 + seededVariance(rng, -2.5, 2.5) + impact.threat * 0.02 - impact.risk * 0.03), 11, 20);
    const rank = clamp(Math.round(13.6 + seededVariance(rng, -4.5, 4.5)), 9, 24);
    return { points, rank };
  }
  const points = clamp(Math.round(12.2 + seededVariance(rng, -2.5, 2.5)), 4, 14);
  const rank = clamp(Math.round(28.4 + seededVariance(rng, -4.5, 5.5)), 25, 36);
  return { points, rank };
}

function chooseOpponentFromPool(pool: CompetitionTeamModel[], target: number, rng: () => number) {
  const sorted = [...pool]
    .filter((club) => club.club !== "Bayern" && club.club !== "Bayern Munich")
    .map((club) => ({
      club: club.club,
      power: club.overall + club.elo / 35 + (club.titleProbability ?? 0) * 55 - (club.volatility ?? 0) * 0.12,
    }))
    .sort((a, b) => Math.abs(a.power - target) - Math.abs(b.power - target));
  const picks = sorted.slice(0, Math.min(6, sorted.length));
  return picks[Math.floor(rng() * picks.length)] ?? sorted[0] ?? { club: "Opponent", power: 85 };
}

function drawUclOpponent(pool: CompetitionTeamModel[], floor: number, eliminated: Set<string>, rng: () => number) {
  const candidates = pool
    .filter((club) => club.club !== "Bayern" && club.club !== "Bayern Munich" && !eliminated.has(club.club))
    .map((club) => ({
      club: club.club,
      power: club.overall + club.elo / 35 + (club.titleProbability ?? 0) * 55 - (club.volatility ?? 0) * 0.12,
    }))
    .filter((club) => club.power >= floor - 8)
    .sort((a, b) => b.power - a.power);
  const weighted = candidates.length ? candidates : [{ club: "Elite opponent", power: floor }];
  const roll = rng();
  const index = roll < 0.18 ? 0 : roll < 0.55 ? Math.floor(rng() * Math.min(4, weighted.length)) : Math.floor(rng() * weighted.length);
  return weighted[Math.min(index, weighted.length - 1)];
}

function choosePokalOpponent(round: { name: string; baseOpponent: number; lowerLeague: boolean }, rng: () => number) {
  const amateurPool = [
    { club: "Preussen Munster", power: 52 },
    { club: "Mannheim", power: 51 },
    { club: "Jahn Regensburg", power: 54 },
    { club: "Ingolstadt", power: 53 },
    { club: "Cottbus", power: 55 },
    { club: "Essen", power: 54 },
    { club: "Duisburg", power: 54 },
    { club: "1860 Munchen", power: 55 },
    { club: "Osnabruck", power: 56 },
  ];
  const lowerLeaguePool = [
    { club: "Saarbrucken", power: 58 },
    { club: "Kaiserslautern", power: 63 },
    { club: "Arminia Bielefeld", power: 60 },
    { club: "Hannover", power: 62 },
    { club: "Hertha", power: 61 },
    { club: "Darmstadt", power: 59 },
    { club: "Fortuna Dusseldorf", power: 60 },
    { club: "Elversberg", power: 57 },
    { club: "Paderborn", power: 61 },
    { club: "Schalke", power: 66 },
  ];
  const topFlightPool = [
    { club: "RB Leipzig", power: 89 },
    { club: "Borussia Dortmund", power: 87 },
    { club: "Bayer Leverkusen", power: 86 },
    { club: "VfB Stuttgart", power: 84 },
    { club: "Eintracht Frankfurt", power: 79 },
    { club: "Hoffenheim", power: 77 },
    { club: "Freiburg", power: 75 },
    { club: "Mainz", power: 73 },
    { club: "Union Berlin", power: 71 },
    { club: "Gladbach", power: 71 },
    { club: "Hamburg", power: 70 },
    { club: "Werder Bremen", power: 69 },
    { club: "Cologne", power: 68 },
    { club: "Augsburg", power: 70 },
  ];
  const pool = round.name === "Round 1" ? amateurPool : round.lowerLeague ? [...amateurPool, ...lowerLeaguePool] : [...lowerLeaguePool.slice(0, 6), ...topFlightPool];
  const ranked = pool.sort((a, b) => Math.abs(a.power - round.baseOpponent) - Math.abs(b.power - round.baseOpponent));
  const picks = ranked.slice(0, Math.min(6, ranked.length));
  return picks[Math.floor(rng() * picks.length)] ?? ranked[0] ?? { club: "Opponent", power: round.baseOpponent };
}

function buildDoubleRoundRobin(clubs: string[]) {
  const cacheKey = clubs.join("|");
  const cached = scheduleCache.get(cacheKey);
  if (cached) return cached;
  const firstLeg = singleRoundRobin(clubs);
  const secondLeg = firstLeg.map((round) => round.map((match) => ({ home: match.away, away: match.home })));
  const schedule = [...firstLeg, ...secondLeg];
  scheduleCache.set(cacheKey, schedule);
  return schedule;
}

const scheduleCache = new Map<string, Array<Array<{ home: string; away: string }>>>();

function singleRoundRobin(clubs: string[]) {
  const list = [...clubs];
  if (list.length % 2 !== 0) {
    list.push("BYE");
  }
  const rounds: Array<Array<{ home: string; away: string }>> = [];
  const n = list.length;
  const half = n / 2;
  for (let round = 0; round < n - 1; round += 1) {
    const pairings: Array<{ home: string; away: string }> = [];
    for (let i = 0; i < half; i += 1) {
      const first = list[i];
      const second = list[n - 1 - i];
      if (first === "BYE" || second === "BYE") continue;
      const home = round % 2 === 0 ? first : second;
      const away = round % 2 === 0 ? second : first;
      pairings.push({ home, away });
    }
    rounds.push(pairings);
    const fixed = list[0];
    const rest = list.slice(1);
    rest.unshift(rest.pop()!);
    list.splice(0, list.length, fixed, ...rest);
  }
  return rounds;
}

function deriveAttack(row: BundesligaProjectedRow) {
  return clamp(Math.round(46 + row.gf * 0.42 + row.pts * 0.12 + row.gd * 0.08), 46, 92);
}

function deriveDefence(row: BundesligaProjectedRow) {
  return clamp(Math.round(46 + (75 - row.ga) * 0.45 + row.pts * 0.08), 46, 92);
}

function deriveMidfield(row: BundesligaProjectedRow) {
  return clamp(Math.round(46 + row.pts * 0.22 + Math.max(0, row.gd) * 0.05), 46, 92);
}

function deriveGoalkeeper(row: BundesligaProjectedRow) {
  return clamp(Math.round(46 + (80 - row.ga) * 0.35 + row.pts * 0.04), 46, 92);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function samplePoisson(lambda: number, rng: () => number) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = 1;
  do {
    k += 1;
    product *= rng();
  } while (product > limit);
  return k - 1;
}

function seededRng(seed: string) {
  let h1 = 1779033703 ^ seed.length;
  let h2 = 3144134277 ^ seed.length;
  let h3 = 1013904242 ^ seed.length;
  let h4 = 2773480762 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    const k = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ k, 597399067);
    h2 = Math.imul(h2 ^ k, 2869860233);
    h3 = Math.imul(h3 ^ k, 951274213);
    h4 = Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  let state = (h1 ^ h2 ^ h3 ^ h4) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(summary: SimulationSummary, key: string, runSalt = "") {
  const signings = summary.signings.map((item) => `${item.player_name}:${item.fee_eur}`).join("|");
  const decisions = summary.decisions.map((item) => `${item.player_id}:${item.decision_type}`).join("|");
  return `${summary.simulation.id}:${key}:${summary.simulation.updated_at}:${summary.simulation.remaining_budget_eur}:${signings}:${decisions}:${runSalt}`;
}

function seededVariance(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng();
}

function seedlessRng(...values: Array<string | number>) {
  return seededRng(values.join(":"));
}
