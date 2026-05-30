import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { bundesligaProjectedTable } from "@/lib/data/bayern2026";
import type { SimulationSummary } from "@/lib/types";
import { clampScore, formatCompactNumber, formatSignedGoalDiff, ordinal } from "@/lib/utils";
import { parseMethodology, performerLabel } from "@/lib/types/methodology";
import type { ReactNode } from "react";

type Methodology = {
  seasonOutcome?: {
    league?: {
      pos?: number;
      club?: string;
      w?: number;
      d?: number;
      l?: number;
      gf?: number;
      ga?: number;
      gd?: number;
      pts?: number;
    };
    table?: Array<{
      pos?: number;
      club?: string;
      w?: number;
      d?: number;
      l?: number;
      gf?: number;
      ga?: number;
      gd?: number;
      pts?: number;
    }>;
    pokal?: { round?: string; opponent?: string | null; score?: string; winner?: string; rounds?: Array<{ round: string; opponent: string; score: string; result: "W" | "D" | "L"; winner?: string }> };
    ucl?: { round?: string; opponent?: string | null; score?: string; winner?: string; rounds?: Array<{ round: string; opponent: string; score: string; result: "W" | "D" | "L"; winner?: string }> };
    trophies?: string[];
    achievements?: Array<{ id: string; title: string; description: string; unlocked: boolean }>;
    topScorer?: Parameters<typeof performerLabel>[0];
    topAssister?: Parameters<typeof performerLabel>[0];
    bestPlayer?: Parameters<typeof performerLabel>[0];
    breakoutPlayer?: Parameters<typeof performerLabel>[0];
    disappointment?: string | null;
    transferVerdict?: string | null;
    verdictText?: string | null;
  };
  calculation?: {
    lineupImpact?: {
      selectedCount?: number;
      outOfPositionCount?: number;
      startingQuality?: number;
      benchQuality?: number;
      attack?: number;
      defence?: number;
      midfield?: number;
      goalkeeper?: number;
      control?: number;
      threat?: number;
      chemistry?: number;
      depth?: number;
      risk?: number;
      rotation?: number;
      width?: number;
    };
    tacticalImpact?: {
      control?: number;
      threat?: number;
      risk?: number;
      fatigue?: number;
      chemistry?: number;
    };
  };
  competitions?: {
    pokal?: { winner_probability?: number; final_probability?: number; semi_final_probability?: number };
    ucl?: Array<{ club?: string; titleProbability?: number; fairOdds?: number }>;
  };
};

type ResultShape = {
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
  methodology_json?: unknown;
} | null;

export function SimulationResult({ result, summary }: { result: ResultShape; summary?: SimulationSummary | null }) {
  const parsedMethodology = parseMethodology(result?.methodology_json);
  const methodology = parsedMethodology.methodology as Methodology;
  const seasonOutcome = methodology?.seasonOutcome;
  const trophies = seasonOutcome?.trophies ?? [];
  const achievements = seasonOutcome?.achievements ?? [];
  const league = seasonOutcome?.league ?? null;
  const actualPlace = league?.pos ?? (result ? Number.parseInt(result.projected_finish, 10) : null);
  const actualPoints = league?.pts ?? result?.projected_points ?? 0;
  const trophyLine =
    trophies.length > 0
      ? `${trophies.length} ${trophies.length === 1 ? "trophy" : "trophies"}`
      : actualPlace !== null && actualPlace <= 4
      ? "Champions League qualification"
      : "No trophies";

  const tableRows = (seasonOutcome?.table?.length ? seasonOutcome.table : bundesligaProjectedTable).map((row) =>
    row.club === "Bayern Munich" && league
      ? {
          ...row,
          ...league,
          club: "Bayern Munich",
          gd: typeof league.gf === "number" && typeof league.ga === "number" ? league.gf - league.ga : row.gd,
        }
      : row,
  );

  const lineupRows = (summary?.lineup?.lineup_json as Array<{ slot: string; playerId: string }> | undefined) ?? [];
  const activeRoster = (summary?.activeRoster ?? []) as SimulationSummary["activeRoster"];
  const rosterNameById = new Map<string, string>(activeRoster.map((entry) => [entry.id, entry.player.name]));
  const selectedPlayers = lineupRows
    .map((slot) => {
      const entry = activeRoster.find((item) => item.id === slot.playerId);
      return {
        slot: slot.slot,
        playerName: entry?.player.name,
        position: entry?.player.position ?? null,
      };
    })
    .filter((item) => Boolean(item.playerName));

  const outOfPositionCount = selectedPlayers.filter((item) => !slotMatchesPosition(item.slot, item.position)).length;
  const topTransferIn = summary?.signings?.slice(0, 4) ?? [];
  const topSales = summary?.decisions?.filter((item) => item.decision_type === "sell").slice(0, 8) ?? [];
  const loaned = summary?.decisions?.filter((item) => item.decision_type === "loan").slice(0, 6) ?? [];
  const pokal = seasonOutcome?.pokal;
  const ucl = seasonOutcome?.ucl;
  const lineupImpact = methodology?.calculation?.lineupImpact;
  const tacticalImpact = methodology?.calculation?.tacticalImpact;

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <CardHeader className="bg-[linear-gradient(135deg,#0f172a,#7f1d1d_58%,#f2c94c)] text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl font-black tracking-tight">2026-27 Season Report</CardTitle>
            <CardDescription className="text-white/80">
              Weighted by squad strength, tactics, injuries, transfers, and cup volatility.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-white/20 bg-white/10 text-white">{actualPlace !== null ? `${ordinal(actualPlace)} Place` : "Place n/a"}</Badge>
            <Badge className="border-white/20 bg-white/10 text-white">{actualPoints} Pts</Badge>
            <Badge className="border-white/20 bg-white/10 text-white">{trophyLine}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {result ? (
          <>
            {!parsedMethodology.valid ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                Some stored result details were malformed, so this view is using safe fallbacks.
              </div>
            ) : null}
            <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="grid gap-5 bg-[#1f3a8a] p-5 text-white lg:grid-cols-[auto_1fr_auto] lg:items-end">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">Points</p>
                  <p className="text-6xl font-black leading-none">{actualPoints}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-2xl font-black">{actualPlace !== null ? `${ordinal(actualPlace)} Place` : "Unknown place"}</p>
                  <p className="max-w-2xl text-sm leading-6 text-white/80">{seasonOutcome?.verdictText ?? result.narrative}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="border-white/20 bg-white/15 text-white">{result.verdict}</Badge>
                  <Badge className="border-white/20 bg-white/15 text-white">Risk {result.risk_rating}</Badge>
                  <Badge className="border-white/20 bg-white/15 text-white">Board {result.board_confidence_score}</Badge>
                  <Badge className="border-white/20 bg-white/15 text-white">Fans {result.fan_confidence_score}</Badge>
                </div>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Stat label="Squad balance" value={result.squad_balance_score} />
                  <Stat label="Tactical fit" value={result.tactical_fit_score} />
                  <Stat label="Budget efficiency" value={result.budget_efficiency_score} />
                  <Stat label="Board confidence" value={result.board_confidence_score} />
                  <Stat label="Fan confidence" value={result.fan_confidence_score} />
                  <Stat label="Injury risk" value={result.injury_vulnerability_score} negative />
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <Panel title="XI impact" description="This is the part the starting XI and role fit actually changed.">
                    <div className="grid gap-2 text-sm">
                      <KeyLine label="Starting quality" value={lineupImpact?.startingQuality != null ? `${lineupImpact.startingQuality}/100` : "n/a"} />
                      <KeyLine label="Chemistry" value={lineupImpact?.chemistry != null ? `${lineupImpact.chemistry}/100` : "n/a"} />
                      <KeyLine label="Control" value={lineupImpact?.control != null ? `${lineupImpact.control}/100` : "n/a"} />
                      <KeyLine label="Threat" value={lineupImpact?.threat != null ? `${lineupImpact.threat}/100` : "n/a"} />
                      <KeyLine label="Out of position" value={lineupImpact?.outOfPositionCount != null ? String(lineupImpact.outOfPositionCount) : "n/a"} />
                      <KeyLine label="Tactical risk" value={tacticalImpact?.risk != null ? `${tacticalImpact.risk}/100` : "n/a"} />
                    </div>
                  </Panel>

                  <Panel title="Tactical fingerprint" description="A quick read on how the board saw the setup.">
                    <div className="grid gap-2 text-sm">
                      <KeyLine label="Pressing load" value={tacticalImpact?.control != null ? `${tacticalImpact.control}/100` : "n/a"} />
                      <KeyLine label="Chance threat" value={tacticalImpact?.threat != null ? `${tacticalImpact.threat}/100` : "n/a"} />
                      <KeyLine label="Fatigue" value={tacticalImpact?.fatigue != null ? `${tacticalImpact.fatigue}/100` : "n/a"} />
                      <KeyLine label="Chemistry" value={tacticalImpact?.chemistry != null ? `${tacticalImpact.chemistry}/100` : "n/a"} />
                    </div>
                  </Panel>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <Panel title="Season verdict" description="A short, direct read on how the season landed.">
                    <div className="space-y-3">
                      <p className="text-sm leading-7 text-slate-700">{seasonOutcome?.verdictText ?? result.narrative}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="success">{seasonOutcome?.transferVerdict ?? "Transfer verdict unavailable"}</Badge>
                        <Badge tone={trophies.length ? "success" : "muted"}>{trophyLine}</Badge>
                        <Badge tone="muted">{seasonOutcome?.disappointment ?? "No clear disappointment"}</Badge>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="Key names">
                    <div className="grid gap-2 text-sm">
                      <KeyLine label="Top scorer" value={performerLabel(seasonOutcome?.topScorer)} />
                      <KeyLine label="Top assister" value={performerLabel(seasonOutcome?.topAssister)} />
                      <KeyLine label="Best player" value={performerLabel(seasonOutcome?.bestPlayer)} />
                      <KeyLine label="Breakout player" value={performerLabel(seasonOutcome?.breakoutPlayer)} />
                      <KeyLine label="Disappointment" value={seasonOutcome?.disappointment ?? "n/a"} />
                    </div>
                  </Panel>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
              <div className="space-y-4">
                <Panel title="Trophy Outlook">
                  <div className="grid gap-2 text-sm text-slate-700">
                    <TrophyRow
                      label="Bundesliga"
                      value={trophies.includes("Bundesliga") ? "Won" : actualPlace !== null ? `${ordinal(actualPlace)} Place` : "-"}
                      tone={trophies.includes("Bundesliga") ? "success" : "muted"}
                    />
                    <TrophyRow
                      label="DFB-Pokal"
                      value={
                        pokal
                          ? pokal.winner && pokal.winner !== "Bayern Munich"
                            ? `Lost to ${pokal.opponent ?? pokal.winner} in ${pokal.round ?? "Unknown"}${pokal.score ? ` (${pokal.score})` : ""}`
                            : `${pokal.round ?? "Unknown"}${pokal.score ? ` (${pokal.score})` : ""}`
                          : `${Math.round((methodology?.competitions?.pokal?.winner_probability ?? 0) * 100)}% model chance`
                      }
                      tone={trophies.includes("DFB-Pokal") ? "success" : "gold"}
                    />
                    <TrophyRow
                      label="Champions League"
                      value={
                        ucl
                          ? ucl.winner && ucl.winner !== "Bayern Munich"
                            ? `Lost to ${ucl.opponent ?? ucl.winner} in ${ucl.round ?? "Unknown"}${ucl.score ? ` (${ucl.score})` : ""}`
                            : `${ucl.round ?? "Unknown"}${ucl.score ? ` (${ucl.score})` : ""}`
                          : "Elite contender tier"
                      }
                      tone={trophies.includes("Champions League") ? "success" : "muted"}
                    />
                    <TrophyRow label="Out of position" value={`${outOfPositionCount} in XI`} tone={outOfPositionCount ? "warning" : "success"} />
                    <TrophyRow label="Transfer verdict" value={seasonOutcome?.transferVerdict ?? "Pending"} tone="muted" />
                  </div>
                </Panel>

                <Panel title="Achievements">
                  <div className="grid gap-2">
                    {achievements.length ? (
                      achievements.map((achievement) => (
                        <div key={achievement.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{achievement.title}</p>
                            <p className="text-xs text-slate-500">{achievement.description}</p>
                          </div>
                          <Badge tone={achievement.unlocked ? "success" : "muted"}>{achievement.unlocked ? "Unlocked" : "Locked"}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Achievements appear after the next simulation run.</p>
                    )}
                  </div>
                </Panel>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <CupPath title="DFB-Pokal path" rounds={pokal?.rounds ?? []} fallback={pokal?.round ?? "Not recorded"} />
                <CupPath title="Champions League path" rounds={ucl?.rounds ?? []} fallback={ucl?.round ?? "Not recorded"} />
              </div>

              <Panel title="Competition context">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(methodology?.competitions?.ucl ?? []).slice(0, 5).map((club) => (
                      <Badge key={club.club ?? "ucl"} tone={club.club === "Bayern" ? "success" : "muted"}>
                        {club.club ?? "Contender"} {club.titleProbability ? `${Math.round(club.titleProbability * 100)}%` : ""}
                      </Badge>
                    ))}
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Model notes</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Wrong-position players reduce tactical fit, injuries widen the points range, and cups use weighted variance instead of fixed outcomes.
                    </p>
                  </div>
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Panel title="Starting XI">
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedPlayers.length ? (
                    selectedPlayers.map((item) => (
                      <div key={`${item.slot}-${item.playerName}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.slot}</p>
                        <p className="mt-1 font-semibold text-slate-950">{item.playerName}</p>
                        <p className="text-xs text-slate-500">{item.position ?? "Unknown position"}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-600">No line-up saved yet.</p>
                  )}
                </div>
              </Panel>

              <Panel title="Transfer Activity">
                <div className="space-y-3">
                  <MiniList
                    title={`Transfers in (${summary?.signings.length ?? 0})`}
                    items={topTransferIn.map((item) => `${item.player_name} · EUR ${item.fee_eur}M`)}
                  />
                  <MiniList
                    title={`Sold (${summary?.decisions.filter((item) => item.decision_type === "sell").length ?? 0})`}
                    items={topSales.map((item) => rosterNameById.get(item.player_id) ?? humanizePlayerId(item.player_id))}
                  />
                  <MiniList
                    title={`Loaned (${loaned.length})`}
                    items={loaned.map((item) => rosterNameById.get(item.player_id) ?? humanizePlayerId(item.player_id))}
                  />
                </div>
              </Panel>
            </section>

            <Panel title="Bundesliga Table" description="Full final table from the league model, adjusted by your current run.">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[2.2rem_1fr_2.4rem_2.4rem_2.4rem_3rem_3rem_3rem_4rem] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>Pos</span>
                  <span>Club</span>
                  <span>W</span>
                  <span>D</span>
                  <span>L</span>
                  <span>GF</span>
                  <span>GA</span>
                  <span>GD</span>
                  <span>Pts</span>
                </div>
                {tableRows.map((row) => (
                  <div
                    key={row.club}
                    className={`grid grid-cols-[2.2rem_1fr_2.4rem_2.4rem_2.4rem_3rem_3rem_3rem_4rem] gap-2 px-3 py-2 text-sm ${zoneClass(row.pos)} ${
                      row.club === "Bayern Munich" ? "bg-[#b80d19]/5 font-semibold text-[#98111c]" : row.pos === 1 ? "bg-emerald-50/70 font-semibold" : "bg-white"
                    }`}
                  >
                    <span>{row.pos}</span>
                    <span>{row.club}</span>
                    <span>{row.w}</span>
                    <span>{row.d}</span>
                    <span>{row.l}</span>
                    <span>{row.gf ?? "-"}</span>
                    <span>{row.ga ?? "-"}</span>
                    <span>{formatSignedGoalDiff(row.gd)}</span>
                    <span>{row.pts}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="border-l-4 border-blue-500 pl-2">UCL</span>
                <span className="border-l-4 border-orange-400 pl-2">Europa</span>
                <span className="border-l-4 border-red-500 pl-2">Relegation zone</span>
              </div>
            </Panel>
          </>
        ) : (
          <p className="text-sm text-slate-600">Complete all five tasks to unlock the season simulation.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  const safeValue = clampScore(value);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{formatCompactNumber(safeValue)}/100</p>
      <Progress value={safeValue} tone={negative ? "negative" : "positive"} className="mt-3" />
    </div>
  );
}

function TrophyRow({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "gold" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

function KeyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[60%] truncate font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? items.map((item) => <Badge key={item} tone="muted">{item}</Badge>) : <span className="text-sm text-slate-500">None</span>}
      </div>
    </div>
  );
}

function slotMatchesPosition(slot: string, position: string | null | undefined) {
  const pos = (position ?? "").toUpperCase();
  if (slot === "GK") return pos.includes("GK");
  if (slot === "LB") return pos.includes("LB") || pos.includes("LWB") || pos.includes("CB");
  if (slot === "LWB") return pos.includes("LWB") || pos.includes("LB") || pos.includes("LM") || pos.includes("LW");
  if (slot === "LCB" || slot === "CB" || slot === "RCB") return pos.includes("CB") || pos.includes("DEF");
  if (slot === "RB") return pos.includes("RB") || pos.includes("RWB") || pos.includes("CB");
  if (slot === "RWB") return pos.includes("RWB") || pos.includes("RB") || pos.includes("RM") || pos.includes("RW");
  if (slot === "DM" || slot === "DM1" || slot === "DM2") return pos.includes("DM") || pos.includes("CM");
  if (slot === "CM" || slot === "LCM" || slot === "RCM") return pos.includes("CM") || pos.includes("DM") || pos.includes("AM");
  if (slot === "AM" || slot === "LAM" || slot === "RAM" || slot === "IW") return pos.includes("AM") || pos.includes("CAM") || pos.includes("W");
  if (slot === "LM") return pos.includes("LM") || pos.includes("LW") || pos.includes("W");
  if (slot === "RM") return pos.includes("RM") || pos.includes("RW") || pos.includes("W");
  if (slot === "LW" || slot === "RW") return pos.includes("W") || pos.includes("FWD") || pos.includes("AM");
  if (slot === "ST" || slot === "ST1" || slot === "ST2") return pos.includes("ST") || pos.includes("FWD");
  return true;
}

function CupPath({
  title,
  rounds,
  fallback,
}: {
  title: string;
  rounds: Array<{ round: string; opponent: string; score: string; result: "W" | "D" | "L"; winner?: string }>;
  fallback: string;
}) {
  return (
    <Panel title={title}>
      <div className="space-y-2">
        {rounds.length ? (
          rounds.map((round) => (
            <div key={`${round.round}-${round.opponent}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-950">{round.round}</p>
                <p className="text-xs text-slate-500">vs {round.opponent}</p>
              </div>
              <div className="text-right">
                <Badge tone={round.result === "W" ? "success" : round.result === "L" ? "warning" : "muted"}>{round.score}</Badge>
                <p className="mt-1 text-[11px] text-slate-500">{round.winner ? `Winner: ${round.winner}` : ""}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">{fallback}</p>
        )}
      </div>
    </Panel>
  );
}

function zoneClass(pos: number | undefined) {
  if (!pos) return "";
  if (pos <= 4) return "border-l-4 border-blue-500";
  if (pos === 5) return "border-l-4 border-orange-400";
  if (pos >= 16) return "border-l-4 border-red-500";
  return "border-l-4 border-transparent";
}

function humanizePlayerId(playerId: string) {
  return playerId
    .replace(/^player_/, "")
    .replace(/^manual_/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
