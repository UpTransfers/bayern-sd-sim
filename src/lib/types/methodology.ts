import { z } from "zod";

export const PerformerSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    goals: z.number().optional(),
    assists: z.number().optional(),
    apps: z.number().optional(),
    goalsPerGame: z.number().optional(),
    rating: z.number().optional(),
  }),
]);

export const CupRoundSchema = z.object({
  round: z.string(),
  opponent: z.string(),
  score: z.string(),
  result: z.enum(["W", "D", "L"]),
  winner: z.string().optional(),
});

export const SeasonMatchResultSchema = z.object({
  matchId: z.string(),
  competition: z.enum(["bundesliga", "pokal", "ucl"]),
  round: z.string().nullable().optional(),
  opponent: z.string(),
  home: z.boolean(),
  scoreFor: z.number(),
  scoreAgainst: z.number(),
  extraTime: z.boolean(),
  penalties: z.boolean(),
  xgFor: z.number(),
  xgAgainst: z.number(),
  turningPoint: z.string().nullable().optional(),
});

export const SeasonTeamStatsSchema = z
  .object({
    leagueMatches: z.number().optional(),
    leagueWins: z.number().optional(),
    leagueDraws: z.number().optional(),
    leagueLosses: z.number().optional(),
    leagueRecord: z.string().optional(),
    goalsFor: z.number().optional(),
    goalsAgainst: z.number().optional(),
    xgFor: z.number().optional(),
    xgAgainst: z.number().optional(),
    cleanSheets: z.number().optional(),
    failedToScore: z.number().optional(),
    homePoints: z.number().optional(),
    awayPoints: z.number().optional(),
    cupMatches: z.number().optional(),
    cupWins: z.number().optional(),
    cupLosses: z.number().optional(),
    averageGoalsFor: z.number().optional(),
    averageGoalsAgainst: z.number().optional(),
    longestUnbeaten: z.number().optional(),
    longestWinRun: z.number().optional(),
  })
  .partial();

export const SeasonPlayerStatSchema = z
  .object({
    name: z.string(),
    position: z.string().nullable().optional(),
    role: z.enum(["GK", "DEF", "MID", "ATT", "UNK"]),
    importance: z.string(),
    apps: z.number().optional(),
    starts: z.number().optional(),
    minutes: z.number().optional(),
    goals: z.number().optional(),
    assists: z.number().optional(),
    rating: z.number().optional(),
    availability: z.number().optional(),
    note: z.string(),
  })
  .partial();

export const SeasonInjuryEventSchema = z
  .object({
    playerName: z.string(),
    issue: z.string(),
    severity: z.enum(["minor", "medium", "major"]),
    matchesOut: z.number(),
    note: z.string(),
  })
  .partial();

export const SeasonInjuryReportSchema = z
  .object({
    summary: z.string().optional(),
    events: z.array(SeasonInjuryEventSchema).optional(),
  })
  .partial();

export const LeagueRowSchema = z
  .object({
    pos: z.number(),
    club: z.string(),
    w: z.number().optional(),
    d: z.number().optional(),
    l: z.number().optional(),
    gf: z.number().optional(),
    ga: z.number().optional(),
    gd: z.number().optional(),
    pts: z.number().optional(),
  })
  .passthrough();

export const CupOutcomeSchema = z
  .object({
    round: z.string().optional(),
    score: z.string().optional(),
    winner: z.string().optional(),
    opponent: z.string().nullable().optional(),
    leaguePhasePoints: z.number().optional(),
    leaguePhaseRank: z.number().optional(),
    rounds: z.array(CupRoundSchema).optional(),
  })
  .partial();

export const SetPieceRoleSchema = z
  .object({
    name: z.string().optional(),
    reason: z.string().optional(),
    score: z.number().optional(),
  })
  .partial();

export const SetPiecePlanSchema = z
  .object({
    captain: SetPieceRoleSchema.optional(),
    penaltyTaker: SetPieceRoleSchema.optional(),
    freeKickTaker: SetPieceRoleSchema.optional(),
    cornerTaker: SetPieceRoleSchema.optional(),
    setPieceRating: z.number().optional(),
    captainInfluence: z.number().optional(),
    offensiveEdge: z.number().optional(),
    penaltyEdge: z.number().optional(),
    notes: z.array(z.string()).optional(),
  })
  .partial();

export const MethodologySchema = z
  .object({
    boardObjectives: z.array(z.string()).optional(),
    calculation: z
      .object({
        finish: z.string().optional(),
        finishPoints: z.number().optional(),
        pointsSwing: z.number().optional(),
        squadBalance: z.number().optional(),
        tactical: z.number().optional(),
        budgetEfficiency: z.number().optional(),
        mediaPressure: z.number().optional(),
        injuryRisk: z.number().optional(),
        lineupImpact: z.record(z.string(), z.unknown()).optional(),
        tacticalImpact: z.record(z.string(), z.unknown()).optional(),
        setPiecePlan: SetPiecePlanSchema.optional(),
      })
      .partial()
      .optional(),
    seasonOutcome: z
      .object({
        league: LeagueRowSchema.optional(),
        table: z.array(LeagueRowSchema).optional(),
        pokal: CupOutcomeSchema.optional(),
        ucl: CupOutcomeSchema.optional(),
        trophies: z.array(z.string()).optional(),
        achievements: z.array(z.object({ id: z.string(), title: z.string(), description: z.string(), unlocked: z.boolean() })).optional(),
        topScorer: PerformerSchema.nullish(),
        topAssister: PerformerSchema.nullish(),
        bestPlayer: PerformerSchema.nullish(),
        breakoutPlayer: PerformerSchema.nullish(),
        disappointment: z.string().nullish(),
        transferVerdict: z.string().nullish(),
        verdictText: z.string().nullish(),
        boardVerdict: z.string().nullish(),
        fanVerdict: z.string().nullish(),
        whyThisHappened: z.string().nullish(),
        bestDecision: z.string().nullish(),
        worstDecision: z.string().nullish(),
        keyTurningPoint: z.string().nullish(),
        mediaHeadline: z.string().nullish(),
        transferGrade: z.string().nullish(),
        matchResults: z.array(SeasonMatchResultSchema).optional(),
        setPiecePlan: SetPiecePlanSchema.optional(),
        teamStats: SeasonTeamStatsSchema.optional(),
        playerStats: z.array(SeasonPlayerStatSchema).optional(),
        injuryReport: SeasonInjuryReportSchema.optional(),
        tacticalSummary: z.string().nullish(),
        availabilitySummary: z.string().nullish(),
      })
      .partial()
      .optional(),
    competitions: z.record(z.string(), z.unknown()).optional(),
    note: z.string().optional(),
  })
  .partial();

export type Methodology = z.infer<typeof MethodologySchema>;
export type Performer = z.infer<typeof PerformerSchema>;

export function parseMethodology(value: unknown): { methodology: Methodology; valid: boolean } {
  const parsed = MethodologySchema.safeParse(value);
  if (!parsed.success) {
    return { methodology: {}, valid: false };
  }
  return { methodology: parsed.data, valid: true };
}

export function performerLabel(value: Performer | null | undefined, fallback = "n/a") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if ("goals" in value && typeof value.goals === "number") {
    const apps = typeof value.apps === "number" ? ` in ${value.apps} apps` : "";
    return `${value.name} - ${value.goals} goals${apps}`;
  }
  if ("assists" in value && typeof value.assists === "number") {
    const apps = typeof value.apps === "number" ? ` in ${value.apps} apps` : "";
    return `${value.name} - ${value.assists} assists${apps}`;
  }
  if ("rating" in value && typeof value.rating === "number") {
    return `${value.name} - ${value.rating.toFixed(1)} avg rating`;
  }
  return value.name;
}
