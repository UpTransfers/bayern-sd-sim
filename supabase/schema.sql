create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  director_name text not null,
  selected_budget_eur integer not null,
  remaining_budget_eur integer not null,
  season_label text not null,
  status text not null,
  board_confidence integer not null default 0,
  fan_confidence integer not null default 0,
  data_confidence integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists data_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null unique,
  source_url text not null,
  license_or_terms_note text not null,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  health_status text not null default 'disabled',
  error_message text
);

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  endpoint text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  error_message text
);

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  external_source text not null,
  external_id text not null,
  name text not null,
  short_name text,
  country text,
  crest_url text,
  venue text,
  founded text,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz
);

create unique index if not exists clubs_external_key on clubs (external_source, external_id);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  external_source text not null,
  external_id text not null,
  name text not null,
  date_of_birth date,
  age integer,
  nationality text,
  position text,
  shirt_number text,
  current_club_id uuid references clubs(id),
  photo_url text,
  data_confidence integer not null default 0,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz
);

create unique index if not exists players_external_key on players (external_source, external_id);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  external_source text not null,
  external_id text not null,
  competition text not null,
  season text not null,
  matchday integer,
  utc_date timestamptz,
  home_team text not null,
  away_team text not null,
  home_score integer,
  away_score integer,
  status text not null,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz
);

create unique index if not exists matches_external_key on matches (external_source, external_id);

create table if not exists standings (
  id uuid primary key default gen_random_uuid(),
  external_source text not null,
  competition text not null,
  season text not null,
  club_name text not null,
  position integer not null,
  played integer,
  won integer,
  drawn integer,
  lost integer,
  goals_for integer,
  goals_against integer,
  goal_difference integer,
  points integer,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz
);

create table if not exists simulation_player_decisions (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid references simulations(id) on delete cascade,
  player_id uuid references players(id),
  decision_type text not null,
  fee_eur integer,
  is_simulator_estimate boolean not null default true,
  confidence_score integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists simulation_signings (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid references simulations(id) on delete cascade,
  player_external_source text not null,
  player_external_id text not null,
  player_name text not null,
  position text,
  nationality text,
  current_club text,
  fee_eur integer not null,
  is_simulator_estimate boolean not null default true,
  tactical_fit_score integer not null default 0,
  squad_need_score integer not null default 0,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists simulation_lineups (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid references simulations(id) on delete cascade,
  formation text not null,
  lineup_json jsonb not null default '[]'::jsonb,
  bench_json jsonb not null default '[]'::jsonb,
  tactical_score integer not null default 0,
  position_fit_score integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists simulation_results (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid references simulations(id) on delete cascade,
  projected_finish text not null,
  projected_points integer not null,
  squad_balance_score integer not null,
  tactical_fit_score integer not null,
  budget_efficiency_score integer not null,
  board_confidence_score integer not null,
  fan_confidence_score integer not null,
  media_pressure_score integer not null,
  injury_vulnerability_score integer not null,
  risk_rating text not null,
  verdict text not null,
  narrative text not null,
  methodology_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists decision_feed (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid references simulations(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text not null,
  impact_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
