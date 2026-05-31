"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw, RotateCcw, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BayernBadge } from "@/components/BayernBadge";
import { toBlob } from "html-to-image";
import type { SimulationSummary } from "@/lib/types";
import { clampScore, formatCurrencyMillions, formatSignedGoalDiff, ordinal } from "@/lib/utils";
import { bundesligaProjectedTable } from "@/lib/data/bayern2026";
import { buildFanPulse } from "@/lib/football/fanPulse";
import { buildSeasonFeed } from "@/lib/football/seasonFeed";
import { parseMethodology, performerLabel } from "@/lib/types/methodology";
import { ShareResultCard } from "@/components/ShareResultCard";
import { SeasonSocialFeed } from "@/components/SeasonSocialFeed";

export default function SeasonReportPage({ simulationId }: { simulationId: string | null }) {
  const router = useRouter();
  const shareRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(simulationId));
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!simulationId) {
      return;
    }

    void (async () => {
      try {
        setLoadError(null);
        const response = await fetch(`/api/simulations/${simulationId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load simulation summary");
        }
        const payload = (await response.json()) as SimulationSummary;
        if (!alive) return;
        setSummary(payload);
      } catch {
        if (alive) {
          setSummary(null);
          setLoadError("Could not load this simulation. Refresh the page or return to the dashboard.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [simulationId]);

  const result = summary?.result ?? null;
  const parsedMethodology = useMemo(() => parseMethodology(result?.methodology_json), [result?.methodology_json]);
  const methodology = parsedMethodology.methodology;
  const seasonOutcome = methodology?.seasonOutcome;
  const calculation = methodology?.calculation;
  const bestDecision = seasonOutcome?.bestDecision ?? result?.best_decision ?? null;
  const worstDecision = seasonOutcome?.worstDecision ?? result?.worst_decision ?? null;
  const keyTurningPoint = seasonOutcome?.keyTurningPoint ?? result?.key_turning_point ?? null;
  const mediaHeadline = seasonOutcome?.mediaHeadline ?? result?.media_headline ?? null;
  const transferGrade = seasonOutcome?.transferGrade ?? result?.transfer_grade ?? null;
  const boardVerdict = seasonOutcome?.boardVerdict ?? result?.board_verdict ?? null;
  const fanVerdict = seasonOutcome?.fanVerdict ?? result?.fan_verdict ?? null;
  const teamStats = seasonOutcome?.teamStats ?? result?.team_stats ?? null;
  const playerStats = seasonOutcome?.playerStats ?? result?.player_stats ?? [];
  const injuryReport = seasonOutcome?.injuryReport ?? result?.injury_report ?? null;
  const tacticalSummary = seasonOutcome?.tacticalSummary ?? result?.tactical_summary ?? null;
  const availabilitySummary = seasonOutcome?.availabilitySummary ?? result?.availability_summary ?? null;
  const whyThisHappened = seasonOutcome?.whyThisHappened ?? result?.why_this_happened ?? result?.narrative ?? "No explanatory season summary was stored.";
  const whySummary = compactWhySummary(whyThisHappened, calculation, result);
  const tacticalImpact = calculation?.tacticalImpact as
    | {
        control?: number;
        threat?: number;
        chemistry?: number;
        fatigue?: number;
      }
    | undefined;
  const lineupEntries = (summary?.lineup?.lineup_json as Array<{ slot: string; playerId: string }> | undefined) ?? [];
  const selectedPlayers = lineupEntries
    .map((entry) => {
      const player = (summary?.activeRoster ?? []).find((item) => item.id === entry.playerId);
      return {
        slot: entry.slot,
        name: player?.player.name ?? "",
        position: player?.player.position ?? null,
      };
    })
    .filter((entry) => Boolean(entry.name));
  const outOfPositionCount = selectedPlayers.filter((entry) => !slotMatchesPosition(entry.slot, entry.position)).length;
  const tableRows = useMemo(
    () => (seasonOutcome?.table?.length ? seasonOutcome.table : bundesligaProjectedTable).map((row) => row),
    [seasonOutcome?.table],
  );
  const trophies = seasonOutcome?.trophies ?? [];
  const setPiecePlan = seasonOutcome?.setPiecePlan;
  const matchResults = seasonOutcome?.matchResults ?? result?.match_results ?? [];
  const matchPreview = matchResults.slice(0, 12);
  const achievementCount = seasonOutcome?.achievements?.filter((item) => item.unlocked).length ?? 0;
  const lineupImpact = calculation?.lineupImpact as
    | {
        startingQuality?: number;
        benchQuality?: number;
        depth?: number;
        rotation?: number;
      }
    | undefined;

  async function playAgain() {
    if (!simulationId || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/simulations/${simulationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetSimulation" }),
      });
      if (!response.ok) {
        throw new Error("Reset failed");
      }
      await refreshSummary();
      router.push(`/dashboard/${simulationId}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveAsPng() {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await document.fonts?.ready;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      const blob = await toBlob(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#f7f7fb",
      });
      if (!blob) {
        throw new Error("Could not render PNG");
      }
      const filename = `bayern-season-report-${simulationId}.png`;
      const anyWindow = window as Window & {
        showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
      };
      if (typeof anyWindow.showSaveFilePicker === "function") {
        const handle = await anyWindow.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "PNG image",
              accept: { "image/png": [".png"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1500);
    } catch {
      setExportError("PNG export failed. Try again after the report finishes loading.");
    } finally {
      setExporting(false);
    }
  }

  async function refreshSummary() {
    if (!simulationId) return;
    try {
      setLoadError(null);
      const response = await fetch(`/api/simulations/${simulationId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as SimulationSummary;
      setSummary(payload);
    } catch {
      setLoadError("Could not reload the simulation after reset. Please refresh once.");
    }
  }

  const verdictLine =
    seasonOutcome?.verdictText ??
    result?.narrative ??
    "No result is stored for this simulation yet. Go back and run a full season.";

  if (!simulationId) {
    return (
      <EmptyState
        title="No simulation selected"
        description="Open a saved Bayern simulation first, then the season report will appear here."
        onPrimary={() => router.push("/")}
        primaryLabel="Start new simulation"
      />
    );
  }

  if (loading) {
    return <LoadingState />;
  }

  if (!summary || !result) {
    return (
      <EmptyState
        title="Season report unavailable"
        description="This simulation has not been run yet or the save was cleared. Return to the dashboard to simulate again."
        onPrimary={() => router.push(`/dashboard/${simulationId}`)}
        primaryLabel="Back to dashboard"
      />
    );
  }

  const place = seasonOutcome?.league?.pos ? ordinal(seasonOutcome.league.pos) : result.projected_finish;
  const points = seasonOutcome?.league?.pts ?? result.projected_points;
  const fanPulse =
    summary && result
      ? buildFanPulse({
          simulationId: simulationId ?? summary.simulation.id,
          summary,
          place,
          points,
          trophies,
          verdictLine,
          transferVerdict: seasonOutcome?.transferVerdict ?? "No transfer verdict recorded.",
      })
      : [];
  const rosterNameById = new Map(summary.activeRoster.map((entry) => [entry.id, entry.player.name]));
  const baselineNameById = new Map((summary.baselineRoster ?? []).map((entry) => [entry.id, entry.player.name]));
  const transferIncomings = summary.signings.slice(0, 4).map((signing) => {
    const fee = formatCurrencyMillions(signing.fee_eur);
    return `${signing.player_name} - ${fee}`;
  });
  const transferOutgoings = [...summary.decisions]
    .filter((item) => item.decision_type === "sell" || item.decision_type === "loan")
    .slice(-4)
    .map((item) => {
      const name = resolveDecisionPlayerName(item, baselineNameById, rosterNameById);
      return `${name} - ${item.decision_type === "sell" ? "Sold" : "Loaned"}`;
    });
  const socialFeed = buildSeasonFeed({
    simulationId: summary.simulation.id,
    summary,
    place: String(place),
    points,
    trophies,
    verdictLine,
    transferVerdict: seasonOutcome?.transferVerdict ?? "No transfer verdict recorded.",
    whySummary,
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(184,13,25,0.08),transparent_22%),linear-gradient(180deg,#f7f7fb,white)] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <BayernBadge />
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950">Season Report</p>
              <p className="text-sm text-slate-500">FC Bayern {summary.simulation.season_label} | {summary.simulation.director_name}</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push(`/dashboard/${simulationId}`)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={saveAsPng} disabled={exporting}>
              {exporting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Save as PNG
            </Button>
            <Button className="w-full sm:w-auto" onClick={playAgain} disabled={saving}>
              {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Play again
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {!parsedMethodology.valid ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            Some stored result details were malformed, so this report is using safe fallbacks.
          </div>
        ) : null}
        {exportError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {exportError}
          </div>
        ) : null}
        {loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {loadError}
          </div>
        ) : null}
        <section className="overflow-visible rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="grid gap-6 bg-[linear-gradient(135deg,#0f172a,#7f1d1d_55%,#b80d19)] p-6 text-white lg:grid-cols-[auto_1fr_auto] lg:items-end lg:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Bundesliga</p>
              <p className="text-6xl font-black leading-none">{points}</p>
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-black">{place} Place</p>
              <p className="max-w-3xl text-sm leading-7 text-white/80">{verdictLine}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-white/20 bg-white/10 text-white">{result.verdict}</Badge>
              <Badge className="border-white/20 bg-white/10 text-white">Board {result.board_confidence_score}</Badge>
              <Badge className="border-white/20 bg-white/10 text-white">Fans {result.fan_confidence_score}</Badge>
              <Badge className="border-white/20 bg-white/10 text-white">Risk {result.risk_rating}</Badge>
            </div>
          </div>

          <div className="grid gap-4 p-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>At a glance</CardTitle>
                <CardDescription>How the year played out in plain football language.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Squad balance" value={clampScore(result.squad_balance_score)} />
                  <Metric label="Tactical fit" value={clampScore(result.tactical_fit_score)} />
                  <Metric label="Budget efficiency" value={clampScore(result.budget_efficiency_score)} />
                  <Metric label="Board confidence" value={clampScore(result.board_confidence_score)} />
                  <Metric label="Fan confidence" value={clampScore(result.fan_confidence_score)} />
                  <Metric label="Injury risk" value={clampScore(result.injury_vulnerability_score)} negative />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Starting XI" value={clampScore(lineupImpact?.startingQuality)} />
                  <Metric label="Bench quality" value={clampScore(lineupImpact?.benchQuality)} />
                  <Metric label="Squad depth" value={clampScore(lineupImpact?.depth)} />
                  <Metric label="Rotation load" value={clampScore(lineupImpact?.rotation)} negative />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                  {verdictLine}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={trophies.includes("Bundesliga") ? "success" : "muted"}>{trophies.includes("Bundesliga") ? "Bundesliga won" : `Bundesliga ${place}`}</Badge>
                  <Badge tone={trophies.includes("DFB-Pokal") ? "success" : "gold"}>
                    {seasonOutcome?.pokal
                      ? seasonOutcome.pokal.winner && seasonOutcome.pokal.winner !== "Bayern Munich"
                        ? `Pokal: Lost to ${seasonOutcome.pokal.opponent ?? seasonOutcome.pokal.winner} in ${seasonOutcome.pokal.round ?? "Unknown"}${seasonOutcome.pokal.score ? ` (${seasonOutcome.pokal.score})` : ""}`
                        : `Pokal: ${seasonOutcome.pokal.round ?? "Unknown"}${seasonOutcome.pokal.score ? ` (${seasonOutcome.pokal.score})` : ""}`
                      : "Pokal not recorded"}
                  </Badge>
                  <Badge tone={trophies.includes("Champions League") ? "success" : "gold"}>
                    {seasonOutcome?.ucl
                      ? seasonOutcome.ucl.winner && seasonOutcome.ucl.winner !== "Bayern Munich"
                        ? `UCL: Lost to ${seasonOutcome.ucl.opponent ?? seasonOutcome.ucl.winner} in ${seasonOutcome.ucl.round ?? "Unknown"}${seasonOutcome.ucl.score ? ` (${seasonOutcome.ucl.score})` : ""}`
                        : `UCL: ${seasonOutcome.ucl.round ?? "Unknown"}${seasonOutcome.ucl.score ? ` (${seasonOutcome.ucl.score})` : ""}`
                      : "UCL not recorded"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Key outcomes</CardTitle>
                <CardDescription>Top performers, biggest miss, and board verdict.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <KeyLine label="Top scorer" value={performerLabel(seasonOutcome?.topScorer)} />
                <KeyLine label="Top assister" value={performerLabel(seasonOutcome?.topAssister)} />
                <KeyLine label="Best player" value={performerLabel(seasonOutcome?.bestPlayer)} />
                <KeyLine label="Breakout" value={performerLabel(seasonOutcome?.breakoutPlayer)} />
                <KeyLine label="Biggest miss" value={seasonOutcome?.disappointment ?? "No single miss stood out"} />
                <KeyLine label="Window" value={seasonOutcome?.transferVerdict ?? "n/a"} />
                <KeyLine label="Best move" value={bestDecision ?? "n/a"} />
                <KeyLine label="Worst move" value={worstDecision ?? "n/a"} />
                <KeyLine label="Turning point" value={keyTurningPoint ?? "n/a"} />
                <KeyLine label="Headline" value={mediaHeadline ?? "n/a"} />
                <KeyLine label="Grade" value={transferGrade ?? "n/a"} />
                <KeyLine label="Board" value={boardVerdict ?? "n/a"} />
                <KeyLine label="Fans" value={fanVerdict ?? "n/a"} />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Why it happened</p>
                  <p className="mt-2 text-sm leading-7 text-slate-700">{whySummary}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/60 p-6 lg:p-8">
            <SeasonSocialFeed posts={socialFeed} />
          </div>

          <div className="border-t border-slate-200 bg-slate-50/60 p-6 lg:p-8">
            <Card className="border-slate-200 bg-white shadow-none">
              <CardHeader className="pb-3">
                <CardTitle>Set-piece plan</CardTitle>
                <CardDescription>Dead-ball roles that fed into the sim and the final report.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <StatChip label="Captain" value={setPiecePlan?.captain?.name ?? "n/a"} subtext={setPiecePlan?.captain?.reason} />
                  <StatChip label="Penalties" value={setPiecePlan?.penaltyTaker?.name ?? "n/a"} subtext={setPiecePlan?.penaltyTaker?.reason} />
                  <StatChip label="Free kicks" value={setPiecePlan?.freeKickTaker?.name ?? "n/a"} subtext={setPiecePlan?.freeKickTaker?.reason} />
                  <StatChip label="Corners" value={setPiecePlan?.cornerTaker?.name ?? "n/a"} subtext={setPiecePlan?.cornerTaker?.reason} />
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Set-piece rating" value={clampScore(setPiecePlan?.setPieceRating)} />
                  <Metric label="Captain influence" value={clampScore(setPiecePlan?.captainInfluence)} />
                  <Metric label="Offensive edge" value={clampScore(setPiecePlan?.offensiveEdge)} />
                  <Metric label="Penalty edge" value={clampScore(setPiecePlan?.penaltyEdge)} />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                  {setPiecePlan?.notes?.length
                    ? setPiecePlan.notes.join(" ")
                    : "Dead-ball authority is folded into the match model even when the report is not unusually set-piece heavy."}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Why it happened</CardTitle>
              <CardDescription>Visible reasons behind the final league and cup outcome.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Starting XI quality" value={clampScore(lineupImpact?.startingQuality)} />
                <Metric label="Bench quality" value={clampScore(lineupImpact?.benchQuality)} />
                <Metric label="Squad depth" value={clampScore(lineupImpact?.depth)} />
                <Metric label="Rotation load" value={clampScore(lineupImpact?.rotation)} negative />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Control" value={clampScore(tacticalImpact?.control)} />
                <Metric label="Threat" value={clampScore(tacticalImpact?.threat)} />
                <Metric label="Chemistry" value={clampScore(tacticalImpact?.chemistry)} />
                <Metric label="Fatigue" value={clampScore(tacticalImpact?.fatigue)} negative />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="muted">Board {boardVerdict ?? "n/a"}</Badge>
                <Badge tone="muted">Fans {fanVerdict ?? "n/a"}</Badge>
                <Badge tone="muted">Transfer grade {transferGrade ?? "n/a"}</Badge>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 shadow-sm">
                {whyThisHappened}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                <p className="font-semibold text-slate-950">Lineup context</p>
                <p className="mt-1">
                  {outOfPositionCount > 0
                    ? `${outOfPositionCount} starting XI role${outOfPositionCount !== 1 ? "s were" : " was"} off natural position, which reduced tactical fit.`
                    : "The starting XI stayed on natural roles, which kept the tactical base stable."}
                </p>
                <p className="mt-2">
                  {selectedPlayers.length
                    ? `Selected XI: ${selectedPlayers.slice(0, 5).map((item) => item.name).join(", ")}${selectedPlayers.length > 5 ? "..." : ""}`
                    : "No starting XI was stored for this run."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMethodologyOpen((value) => !value)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Simulation methodology
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    Open the weighted explanation behind the final score.
                  </span>
                </span>
                <Badge tone="muted">{methodologyOpen ? "Hide" : "Show"}</Badge>
              </button>
              {methodologyOpen ? (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs leading-6 text-slate-500">
                    The season result is built from lineup quality, tactical fit, squad balance, transfer impact, board confidence,
                    and a seeded variance layer. Strong Bayern squads still win often, but cups and role mismatches can shift the
                    path.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <MiniLine
                      label="League swing"
                      value={`${(calculation?.pointsSwing ?? 0) >= 0 ? "+" : ""}${calculation?.pointsSwing ?? 0}`}
                    />
                    <MiniLine
                      label="Squad balance"
                      value={`${calculation?.squadBalance ?? result?.squad_balance_score ?? 0}/100`}
                    />
                    <MiniLine
                      label="Tactical fit"
                      value={`${calculation?.tactical ?? result?.tactical_fit_score ?? 0}/100`}
                    />
                    <MiniLine
                      label="Injury risk"
                      value={`${calculation?.injuryRisk ?? result?.injury_vulnerability_score ?? 0}/100`}
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Starting XI snapshot</CardTitle>
              <CardDescription>The saved lineup that fed into the season model.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedPlayers.length ? (
                selectedPlayers.map((player) => (
                  <div key={`${player.slot}-${player.name}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{player.slot}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{player.name}</p>
                    </div>
                    <Badge tone={player.position && !slotMatchesPosition(player.slot, player.position) ? "warning" : "success"}>
                      {player.position ?? "Unknown"}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No lineup was stored for this run.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Team stats</CardTitle>
              <CardDescription>League shape, chance quality, and home-away split.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <KeyLine label="League record" value={teamStats?.leagueRecord ?? "n/a"} />
                <KeyLine
                  label="Goals"
                  value={teamStats?.goalsFor != null && teamStats.goalsAgainst != null ? `${teamStats.goalsFor}-${teamStats.goalsAgainst}` : "n/a"}
                />
                <KeyLine
                  label="xG"
                  value={teamStats?.xgFor != null && teamStats.xgAgainst != null ? `${teamStats.xgFor.toFixed(1)}-${teamStats.xgAgainst.toFixed(1)}` : "n/a"}
                />
                <KeyLine label="Clean sheets" value={teamStats?.cleanSheets != null ? String(teamStats.cleanSheets) : "n/a"} />
                <KeyLine label="Failed to score" value={teamStats?.failedToScore != null ? String(teamStats.failedToScore) : "n/a"} />
                <KeyLine
                  label="Home/Away pts"
                  value={teamStats?.homePoints != null && teamStats.awayPoints != null ? `${teamStats.homePoints}/${teamStats.awayPoints}` : "n/a"}
                />
                <KeyLine label="Unbeaten run" value={teamStats?.longestUnbeaten != null ? String(teamStats.longestUnbeaten) : "n/a"} />
                <KeyLine label="Win run" value={teamStats?.longestWinRun != null ? String(teamStats.longestWinRun) : "n/a"} />
                <KeyLine label="Cup games" value={teamStats?.cupMatches != null ? String(teamStats.cupMatches) : "n/a"} />
                <KeyLine
                  label="Cup record"
                  value={teamStats?.cupWins != null && teamStats.cupLosses != null ? `${teamStats.cupWins}-${teamStats.cupLosses}` : "n/a"}
                />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {tacticalSummary ?? "The season stats are stored as simulator output, not official club data."}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Player stats</CardTitle>
              <CardDescription>Season leaders and their simulator outputs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {playerStats.length ? (
                playerStats.slice(0, 6).map((player) => (
                  <div key={`${player.name}-${player.role}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{player.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {player.position ?? "Unknown"} · {player.importance ?? "unknown"} · {player.note ?? "Simulator estimate"}
                        </p>
                      </div>
                      <Badge tone={(player.availability ?? 0) >= 82 ? "success" : (player.availability ?? 0) >= 68 ? "gold" : "warning"}>
                        {player.availability ?? "n/a"}% avail
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                      <StatChip label="Apps" value={player.apps != null ? String(player.apps) : "n/a"} />
                      <StatChip label="Goals" value={player.goals != null ? String(player.goals) : "n/a"} />
                      <StatChip label="Assists" value={player.assists != null ? String(player.assists) : "n/a"} />
                      <StatChip label="Rating" value={player.rating != null ? player.rating.toFixed(1) : "n/a"} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">Player stats were not stored for this run.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Availability & injuries</CardTitle>
              <CardDescription>Who was affected and how much squad time it cost.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {availabilitySummary ?? "Availability is only shown when the simulator stored the season breakdown."}
              </div>
              <div className="space-y-2">
                {injuryReport?.events?.length ? (
                  injuryReport.events.map((event) => (
                    <div key={`${event.playerName}-${event.issue}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{event.playerName}</p>
                          <p className="text-xs text-slate-500">{event.issue}</p>
                        </div>
                        <Badge tone={event.severity === "major" ? "warning" : event.severity === "medium" ? "gold" : "muted"}>
                          {event.matchesOut} match{event.matchesOut === 1 ? "" : "es"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{event.note}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No injury report was stored for this run.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Tactical summary</CardTitle>
              <CardDescription>A short read on shape, control, and risk.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Starting XI" value={clampScore(lineupImpact?.startingQuality)} />
                <Metric label="Bench quality" value={clampScore(lineupImpact?.benchQuality)} />
                <Metric label="Control" value={clampScore(tacticalImpact?.control)} />
                <Metric label="Threat" value={clampScore(tacticalImpact?.threat)} />
                <Metric label="Chemistry" value={clampScore(tacticalImpact?.chemistry)} />
                <Metric label="Fatigue" value={clampScore(tacticalImpact?.fatigue)} negative />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {tacticalSummary ?? "The tactical summary was not stored for this run."}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <CupPathCard title="DFB-Pokal path" rounds={seasonOutcome?.pokal?.rounds ?? []} fallback={seasonOutcome?.pokal?.round ?? "Not recorded"} />
          <CupPathCard title="Champions League path" rounds={seasonOutcome?.ucl?.rounds ?? []} fallback={seasonOutcome?.ucl?.round ?? "Not recorded"} />
        </section>

        {matchResults.length ? (
          <section className="grid gap-6">
            <Card className="border-slate-200">
              <CardHeader>
              <CardTitle>Match log</CardTitle>
              <CardDescription>Stored fixtures from the season model. The full log is kept in the result data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-2 pr-1">
                  {matchPreview.map((match) => {
                    const tone =
                      match.scoreFor > match.scoreAgainst ? "success" : match.scoreFor === match.scoreAgainst ? "gold" : "warning";
                    return (
                      <div
                        key={match.matchId}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            {match.competition} · {match.round ?? "Match"}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-950">{match.opponent}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {match.home ? "Home" : "Away"} {match.extraTime ? "· AET" : ""} {match.penalties ? "· Pens" : ""}{" "}
                            {match.turningPoint ? `· ${match.turningPoint}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-slate-950">
                            {match.scoreFor}-{match.scoreAgainst}
                          </p>
                          <Badge tone={tone}>{match.scoreFor > match.scoreAgainst ? "Won" : match.scoreFor === match.scoreAgainst ? "Draw" : "Lost"}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {matchResults.length > matchPreview.length ? (
                  <p className="text-xs text-slate-500">Showing {matchPreview.length} of {matchResults.length} stored fixtures.</p>
                ) : null}
              </CardContent>
            </Card>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Bundesliga table</CardTitle>
              <CardDescription>Final table from the season model.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <div className="min-w-[48rem]">
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
                      className={`grid grid-cols-[2.2rem_1fr_2.4rem_2.4rem_2.4rem_3rem_3rem_3rem_4rem] gap-2 px-3 py-2 text-sm ${zoneClass(row.pos as number)} ${
                        row.club === "Bayern Munich" ? "bg-[#b80d19]/5 font-semibold text-[#8a0f19]" : row.pos === 1 ? "bg-emerald-50/70 font-semibold" : "bg-white"
                      }`}
                    >
                      <span>{row.pos}</span>
                      <span>{row.club}</span>
                      <span>{row.w ?? "-"}</span>
                      <span>{row.d ?? "-"}</span>
                      <span>{row.l ?? "-"}</span>
                      <span>{row.gf ?? "-"}</span>
                      <span>{row.ga ?? "-"}</span>
                      <span>{formatSignedGoalDiff(row.gd)}</span>
                      <span>{row.pts}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="border-l-4 border-blue-500 pl-2">UCL</span>
                <span className="border-l-4 border-orange-400 pl-2">Europa</span>
                <span className="border-l-4 border-red-500 pl-2">Relegation zone</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Achievements</CardTitle>
              <CardDescription>Readable season badges, not arcade clutter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone={trophies.length ? "success" : "muted"}>{trophies.length ? `${trophies.length} trophies` : "No trophies"}</Badge>
                <Badge tone="gold">{achievementCount} achievements</Badge>
                <Badge tone="muted">Board {result.board_confidence_score}/100</Badge>
              </div>
              <div className="grid gap-2">
                {seasonOutcome?.achievements?.length ? (
                  seasonOutcome.achievements.map((achievement) => (
                    <div key={achievement.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{achievement.title}</p>
                        <p className="text-xs text-slate-500">{achievement.description}</p>
                      </div>
                      <Badge tone={achievement.unlocked ? "success" : "muted"}>{achievement.unlocked ? "Unlocked" : "Locked"}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No achievements recorded for this run.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Transfer verdict</CardTitle>
                <CardDescription>Board view of the window.</CardDescription>
              </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-7 text-slate-700">{seasonOutcome?.transferVerdict ?? "No transfer verdict recorded."}</p>
              <div className="flex flex-wrap gap-2">
                <Badge tone="muted">{summary.signings.length} signings</Badge>
                <Badge tone="muted">{summary.soldPlayerIds.length} sales</Badge>
                <Badge tone="muted">{summary.loanedPlayerIds.length} loans</Badge>
                <Badge tone="muted">Budget {formatCurrencyMillions(summary.simulation.remaining_budget_eur)}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Important names</CardTitle>
              <CardDescription>Players that shaped the run.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <MiniLine label="Top scorer" value={performerLabel(seasonOutcome?.topScorer)} />
              <MiniLine label="Top assister" value={performerLabel(seasonOutcome?.topAssister)} />
              <MiniLine label="Best player" value={performerLabel(seasonOutcome?.bestPlayer)} />
              <MiniLine label="Breakout" value={performerLabel(seasonOutcome?.breakoutPlayer)} />
              <MiniLine label="Biggest miss" value={seasonOutcome?.disappointment ?? "No single miss stood out"} />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-slate-200 bg-slate-50/80">
            <CardHeader>
              <CardTitle>Transparency note</CardTitle>
              <CardDescription>What is live, what is curated, and what is simulated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
              <p>
                This report is fan-made. Live source data is labeled in the dashboard, fallback research is curated by hand, and season outcomes are simulator
                estimates.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone="muted">Curated fallback</Badge>
                <Badge tone="muted">Simulator estimate</Badge>
                <Badge tone="muted">External reference value</Badge>
                <Badge tone="muted">Estimated wage tier</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mx-auto w-full max-w-4xl" ref={shareRef}>
          <ShareResultCard
            clubName="FC Bayern Munich"
            seasonLabel={summary.simulation.season_label}
            place={`${place} place`}
            points={points}
            verdict={verdictLine}
            boardRating={clampScore(result.board_confidence_score)}
            fanRating={clampScore(result.fan_confidence_score)}
            transferVerdict={seasonOutcome?.transferVerdict ?? "No transfer verdict recorded."}
            bestDecision={bestDecision ?? "n/a"}
            worstDecision={worstDecision ?? "n/a"}
            keyTurningPoint={keyTurningPoint ?? "n/a"}
            mediaHeadline={mediaHeadline ?? "n/a"}
            transferGrade={transferGrade ?? "n/a"}
            boardVerdict={boardVerdict ?? "n/a"}
            fanVerdict={fanVerdict ?? "n/a"}
            whyThisHappened={whySummary}
            topScorer={performerLabel(seasonOutcome?.topScorer)}
            topAssister={performerLabel(seasonOutcome?.topAssister)}
            bestPlayer={performerLabel(seasonOutcome?.bestPlayer)}
            breakoutPlayer={performerLabel(seasonOutcome?.breakoutPlayer)}
            disappointment={seasonOutcome?.disappointment ?? "n/a"}
            trophies={trophies}
            transferIncomings={transferIncomings}
            transferOutgoings={transferOutgoings}
            pokalLine={
              seasonOutcome?.pokal
                ? seasonOutcome.pokal.winner && seasonOutcome.pokal.winner !== "Bayern Munich"
                  ? `Lost to ${seasonOutcome.pokal.opponent ?? seasonOutcome.pokal.winner} in ${seasonOutcome.pokal.round ?? "unknown round"}${seasonOutcome.pokal.score ? ` (${seasonOutcome.pokal.score})` : ""}`
                  : `${seasonOutcome.pokal.round ?? "unknown round"}${seasonOutcome.pokal.score ? ` (${seasonOutcome.pokal.score})` : ""}`
                : "No Pokal record"
            }
            uclLine={
              seasonOutcome?.ucl
                ? seasonOutcome.ucl.winner && seasonOutcome.ucl.winner !== "Bayern Munich"
                  ? `Lost to ${seasonOutcome.ucl.opponent ?? seasonOutcome.ucl.winner} in ${seasonOutcome.ucl.round ?? "unknown round"}${seasonOutcome.ucl.score ? ` (${seasonOutcome.ucl.score})` : ""}`
                  : `${seasonOutcome.ucl.round ?? "unknown round"}${seasonOutcome.ucl.score ? ` (${seasonOutcome.ucl.score})` : ""}`
                : "No Champions League record"
            }
            highlights={[
              { label: "Board verdict", value: result.verdict },
              { label: "Season note", value: verdictLine },
            ]}
            fanPulse={fanPulse}
          />
        </section>

        <div aria-hidden className="pointer-events-none fixed left-[-20000px] top-0 w-[1080px] bg-[#f7f7fb] p-6 opacity-0">
          <div ref={exportRef} className="w-[1080px]">
            <ShareResultCard
              clubName="FC Bayern Munich"
              seasonLabel={summary.simulation.season_label}
              place={`${place} place`}
              points={points}
              verdict={verdictLine}
              boardRating={clampScore(result.board_confidence_score)}
              fanRating={clampScore(result.fan_confidence_score)}
              transferVerdict={seasonOutcome?.transferVerdict ?? "No transfer verdict recorded."}
              bestDecision={bestDecision ?? "n/a"}
              worstDecision={worstDecision ?? "n/a"}
              keyTurningPoint={keyTurningPoint ?? "n/a"}
              mediaHeadline={mediaHeadline ?? "n/a"}
              transferGrade={transferGrade ?? "n/a"}
              boardVerdict={boardVerdict ?? "n/a"}
              fanVerdict={fanVerdict ?? "n/a"}
              whyThisHappened={whySummary}
              topScorer={performerLabel(seasonOutcome?.topScorer)}
              topAssister={performerLabel(seasonOutcome?.topAssister)}
              bestPlayer={performerLabel(seasonOutcome?.bestPlayer)}
              breakoutPlayer={performerLabel(seasonOutcome?.breakoutPlayer)}
              disappointment={seasonOutcome?.disappointment ?? "n/a"}
              trophies={trophies}
              transferIncomings={transferIncomings}
              transferOutgoings={transferOutgoings}
              pokalLine={
                seasonOutcome?.pokal
                  ? seasonOutcome.pokal.winner && seasonOutcome.pokal.winner !== "Bayern Munich"
                    ? `Lost to ${seasonOutcome.pokal.opponent ?? seasonOutcome.pokal.winner} in ${seasonOutcome.pokal.round ?? "unknown round"}${seasonOutcome.pokal.score ? ` (${seasonOutcome.pokal.score})` : ""}`
                    : `${seasonOutcome.pokal.round ?? "unknown round"}${seasonOutcome.pokal.score ? ` (${seasonOutcome.pokal.score})` : ""}`
                  : "No Pokal record"
              }
              uclLine={
                seasonOutcome?.ucl
                  ? seasonOutcome.ucl.winner && seasonOutcome.ucl.winner !== "Bayern Munich"
                    ? `Lost to ${seasonOutcome.ucl.opponent ?? seasonOutcome.ucl.winner} in ${seasonOutcome.ucl.round ?? "unknown round"}${seasonOutcome.ucl.score ? ` (${seasonOutcome.ucl.score})` : ""}`
                    : `${seasonOutcome.ucl.round ?? "unknown round"}${seasonOutcome.ucl.score ? ` (${seasonOutcome.ucl.score})` : ""}`
                  : "No Champions League record"
              }
              highlights={[
                { label: "Board verdict", value: result.verdict },
                { label: "Season note", value: verdictLine },
              ]}
              fanPulse={fanPulse}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value}/100</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${
            negative
              ? value >= 70
                ? "from-red-500 to-red-300"
                : value >= 45
                  ? "from-amber-400 to-yellow-300"
                  : "from-emerald-500 to-emerald-300"
              : value >= 70
                ? "from-emerald-500 to-emerald-300"
                : value >= 45
                  ? "from-amber-400 to-yellow-300"
                  : "from-red-500 to-red-300"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function StatChip({ label, value, subtext }: { label: string; value: string; subtext?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
      {subtext ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtext}</p> : null}
    </div>
  );
}

function KeyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-full text-left text-sm font-semibold leading-5 text-slate-950 sm:max-w-[60%] sm:text-right">{value}</span>
    </div>
  );
}

function MiniLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="max-w-full text-left text-sm font-semibold leading-5 text-slate-950 sm:text-right">{value}</span>
    </div>
  );
}

function resolveDecisionPlayerName(
  item: { player_id: string; player_name?: string | null; notes?: string | null },
  baselineNameById: Map<string, string>,
  rosterNameById: Map<string, string>,
) {
  const direct = item.player_name?.trim();
  if (direct) return direct;

  const baseline = baselineNameById.get(item.player_id)?.trim();
  if (baseline) return baseline;

  const roster = rosterNameById.get(item.player_id)?.trim();
  if (roster) return roster;

  const noted = item.notes?.match(/(?:Sale tiers|Loan package).*?([A-Z][A-Za-z' -]+)\.?$/)?.[1]?.trim();
  if (noted) return noted;

  return humanizeDecisionPlayerId(item.player_id);
}

function humanizeDecisionPlayerId(playerId: string) {
  return playerId
    .replace(/^player[_:-]?/i, "")
    .replace(/^manual[_:-]?/i, "")
    .replace(/^market:/i, "")
    .split(/[-_:]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slotMatchesPosition(slot: string, position: string | null | undefined) {
  const pos = (position ?? "").toUpperCase();
  if (slot === "GK") return pos.includes("GK");
  if (slot === "LB" || slot === "LWB") return pos.includes("LB") || pos.includes("LWB") || pos.includes("CB");
  if (slot === "LCB" || slot === "CB" || slot === "RCB") return pos.includes("CB") || pos.includes("DEF");
  if (slot === "RB" || slot === "RWB") return pos.includes("RB") || pos.includes("RWB") || pos.includes("CB");
  if (/DM/.test(slot)) return pos.includes("DM") || pos.includes("CM");
  if (/CM/.test(slot)) return pos.includes("CM") || pos.includes("DM") || pos.includes("AM");
  if (/AM|IW/.test(slot)) return pos.includes("AM") || pos.includes("CAM") || pos.includes("W");
  if (/LM|RM/.test(slot)) return pos.includes("M") || pos.includes("W");
  if (/LW|RW/.test(slot)) return pos.includes("W") || pos.includes("FWD") || pos.includes("AM");
  if (/ST/.test(slot)) return pos.includes("ST") || pos.includes("FWD");
  return true;
}

function compactWhySummary(
  raw: string,
  calculation:
    | {
        pointsSwing?: number;
        squadBalance?: number;
        tactical?: number;
        injuryRisk?: number;
      }
    | undefined,
  result: NonNullable<SimulationSummary["result"]> | null,
) {
  const text = raw.trim();
  if (text && text.length <= 180 && !text.startsWith("No explanatory season summary")) {
    return text;
  }

  const pointsSwing = calculation?.pointsSwing ?? 0;
  const squadBalance = calculation?.squadBalance ?? result?.squad_balance_score ?? 0;
  const tacticalFit = calculation?.tactical ?? result?.tactical_fit_score ?? 0;
  const injuryRisk = calculation?.injuryRisk ?? result?.injury_vulnerability_score ?? 0;
  const swingLabel = pointsSwing >= 0 ? `+${pointsSwing}` : `${pointsSwing}`;
  const balanceLabel = squadBalance >= 70 ? "strong squad balance" : squadBalance >= 50 ? "usable squad balance" : "thin squad depth";
  const tacticalLabel = tacticalFit >= 70 ? "good tactical fit" : tacticalFit >= 50 ? "mixed tactical fit" : "poor tactical fit";
  const injuryLabel = injuryRisk >= 70 ? "heavy injury pressure" : injuryRisk >= 50 ? "some injury pressure" : "limited injury pressure";

  return `The season turned on a ${swingLabel} league swing, ${balanceLabel}, ${tacticalLabel}, and ${injuryLabel}.`;
}

function zoneClass(pos: number | undefined) {
  if (!pos) return "";
  if (pos <= 4) return "border-l-4 border-blue-500";
  if (pos === 5) return "border-l-4 border-orange-400";
  if (pos >= 16) return "border-l-4 border-red-500";
  return "border-l-4 border-transparent";
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f7fb,white)] px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-44 rounded-[2rem]" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-[2rem]" />
          <Skeleton className="h-96 rounded-[2rem]" />
        </div>
      </div>
    </div>
  );
}

function CupPathCard({
  title,
  rounds,
  fallback,
}: {
  title: string;
  rounds: Array<{ round: string; opponent: string; score: string; result: "W" | "D" | "L"; winner?: string }>;
  fallback: string;
}) {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Round-by-round path, including the exact opponent that ended the run.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rounds.length ? (
          rounds.map((round) => (
            <div key={`${round.round}-${round.opponent}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
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
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  description,
  onPrimary,
  primaryLabel,
}: {
  title: string;
  description: string;
  onPrimary: () => void;
  primaryLabel: string;
}) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f7fb,white)] px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <BayernBadge />
        <div className="space-y-3">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{title}</h1>
          <p className="text-base leading-7 text-slate-600">{description}</p>
        </div>
        <Button onClick={onPrimary}>{primaryLabel}</Button>
      </div>
    </div>
  );
}

