export type DataSourceName =
  | "openligadb"
  | "football-data"
  | "thesportsdb"
  | "wikidata";

export type HealthStatus = "healthy" | "degraded" | "disabled" | "error";

export type SimulationStatus = "draft" | "ready" | "simulated";

export type TaskId =
  | "preseason"
  | "sell"
  | "loan"
  | "sign"
  | "formation";

export type SourceBadge = {
  source: DataSourceName;
  label: string;
  available: boolean;
};

export type DataSourceRecord = {
  id: string;
  source_name: DataSourceName;
  source_url: string;
  license_or_terms_note: string;
  enabled: boolean;
  last_checked_at: string | null;
  health_status: HealthStatus;
  error_message: string | null;
};

export type TacticalSettings = {
  pressingIntensity: number;
  defensiveLineHeight: number;
  pressingMode: "man" | "zonal";
  fullbackRole: "inverted" | "balanced" | "wide";
  wingerWidth: number;
  buildUpSpeed: number;
  ballsInBehindRisk: number;
  counterpressingAggression: number;
  rotationLevel: number;
  strikerDropDeep: number;
  pivotSecurity: number;
};

export type SetPieceSettings = {
  captainId: string | null;
  penaltyTakerId: string | null;
  freeKickTakerId: string | null;
  cornerTakerId: string | null;
};

export type SyncRun = {
  id: string;
  source_name: DataSourceName;
  endpoint: string;
  status: "running" | "success" | "partial" | "error";
  started_at: string;
  finished_at: string | null;
  records_inserted: number;
  records_updated: number;
  error_message: string | null;
};

export type ClubRecord = {
  id: string;
  external_source: DataSourceName | "manual";
  external_id: string;
  name: string;
  short_name: string | null;
  country: string | null;
  crest_url: string | null;
  venue: string | null;
  founded: string | null;
  raw_json: unknown;
  last_synced_at: string | null;
};

export type PlayerRecord = {
  id: string;
  external_source: DataSourceName | "manual";
  external_id: string;
  name: string;
  date_of_birth: string | null;
  age: number | null;
  nationality: string | null;
  position: string | null;
  shirt_number: string | null;
  current_club_id: string | null;
  photo_url: string | null;
  data_confidence: number;
  raw_json: unknown;
  last_synced_at: string | null;
  bayern_category?: "first_team" | "loan_return" | "youth" | "other";
  transfer_value_min_eur_m?: number | null;
  transfer_value_max_eur_m?: number | null;
  bayern_fit_score?: number | null;
  wage_pressure_note?: string | null;
  traits?: string[] | null;
  personality_note?: string | null;
  foot?: string | null;
};

export type MatchRecord = {
  id: string;
  external_source: DataSourceName;
  external_id: string;
  competition: string;
  season: string;
  matchday: number | null;
  utc_date: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  raw_json: unknown;
  last_synced_at: string | null;
};

export type StandingRecord = {
  id: string;
  external_source: DataSourceName;
  competition: string;
  season: string;
  club_name: string;
  position: number;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goals_for: number | null;
  goals_against: number | null;
  goal_difference: number | null;
  points: number | null;
  raw_json: unknown;
  last_synced_at: string | null;
};

export type Simulation = {
  id: string;
  user_id: string | null;
  director_name: string;
  selected_budget_eur: number;
  remaining_budget_eur: number;
  season_label: string;
  status: SimulationStatus;
  board_confidence: number;
  fan_confidence: number;
  data_confidence: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  formation: string | null;
  tactics_json: TacticalSettings | null;
  set_pieces_json: SetPieceSettings | null;
  completed_tasks: TaskId[];
  current_task: TaskId | null;
  notes: string | null;
};

export type SimulationPlayerDecision = {
  id: string;
  simulation_id: string;
  player_id: string;
  decision_type: "sell" | "loan" | "keep" | "development";
  fee_eur: number | null;
  is_simulator_estimate: boolean;
  confidence_score: number;
  notes: string | null;
  created_at: string;
};

export type SimulationSigning = {
  id: string;
  simulation_id: string;
  player_external_source: string;
  player_external_id: string;
  player_name: string;
  position: string | null;
  nationality: string | null;
  current_club: string | null;
  fee_eur: number;
  is_simulator_estimate: boolean;
  tactical_fit_score: number;
  squad_need_score: number;
  raw_json: unknown;
  created_at: string;
};

export type SimulationLineup = {
  id: string;
  simulation_id: string;
  formation: string;
  lineup_json: unknown;
  bench_json: unknown;
  tactical_score: number;
  position_fit_score: number;
  created_at: string;
};

export type SimulationResult = {
  id: string;
  simulation_id: string;
  projected_finish: string;
  projected_points: number;
  squad_balance_score: number;
  tactical_fit_score: number;
  budget_efficiency_score: number;
  board_confidence_score: number;
  fan_confidence_score: number;
  media_pressure_score: number;
  injury_vulnerability_score: number;
  risk_rating: string;
  verdict: string;
  narrative: string;
  methodology_json: unknown;
  created_at: string;
};

export type DecisionFeedItem = {
  id: string;
  simulation_id: string;
  event_type: string;
  title: string;
  description: string;
  impact_json: unknown;
  created_at: string;
};

export type Store = {
  users: Array<{ id: string; display_name: string; created_at: string }>;
  simulations: Simulation[];
  data_sources: DataSourceRecord[];
  sync_runs: SyncRun[];
  clubs: ClubRecord[];
  players: PlayerRecord[];
  matches: MatchRecord[];
  standings: StandingRecord[];
  simulation_player_decisions: SimulationPlayerDecision[];
  simulation_signings: SimulationSigning[];
  simulation_lineups: SimulationLineup[];
  simulation_results: SimulationResult[];
  decision_feed: DecisionFeedItem[];
};

export type SimulationRosterEntry =
  | {
      kind: "catalog";
      id: string;
      player: PlayerRecord;
      isSigned: false;
    }
  | {
      kind: "signing";
      id: string;
      player: {
        id: string;
        name: string;
        position: string | null;
        nationality: string | null;
        currentClub: string | null;
        photo_url: string | null;
        age: number | null;
        rating?: number | null;
        form?: number | null;
        ability?: number | null;
        bayernFit?: number | null;
        fee?: number | null;
        foot?: string | null;
        traits?: string[] | null;
        personalityNote?: string | null;
      };
      isSigned: true;
    };

export type SimulationSummary = {
  simulation: Simulation;
  club: ClubRecord | null;
  currentStanding: StandingRecord | null;
  recentMatches: MatchRecord[];
  sourceHealth: DataSourceRecord[];
  activeRoster: SimulationRosterEntry[];
  sellRoster: SimulationRosterEntry[];
  loanReturnPool: PlayerRecord[];
  youthProspects: PlayerRecord[];
  soldPlayerIds: string[];
  loanedPlayerIds: string[];
  decisions: SimulationPlayerDecision[];
  signings: SimulationSigning[];
  lineup: SimulationLineup | null;
  result: SimulationResult | null;
  feed: DecisionFeedItem[];
};
