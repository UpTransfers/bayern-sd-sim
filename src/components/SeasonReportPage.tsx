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
import { parseMethodology, performerLabel } from "@/lib/types/methodology";
import { ShareResultCard } from "@/components/ShareResultCard";

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
  const tableRows = useMemo(
    () => (seasonOutcome?.table?.length ? seasonOutcome.table : bundesligaProjectedTable).map((row) => row),
    [seasonOutcome?.table],
  );
  const trophies = seasonOutcome?.trophies ?? [];
  const setPiecePlan = seasonOutcome?.setPiecePlan;
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
  const transferIncomings = summary.signings.slice(0, 4).map((signing) => {
    const fee = formatCurrencyMillions(signing.fee_eur);
    return `${signing.player_name} · ${fee}`;
  });
  const transferOutgoings = [...summary.decisions]
    .filter((item) => item.decision_type === "sell" || item.decision_type === "loan")
    .slice(-4)
    .map((item) => {
      const name =
        summary.sellRoster.find((player) => player.id === item.player_id)?.player.name ??
        summary.activeRoster.find((player) => player.id === item.player_id)?.player.name ??
        "Player";
      return `${name} · ${item.decision_type === "sell" ? "Sold" : "Loaned"}`;
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
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
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
                <CardTitle>Season summary</CardTitle>
                <CardDescription>How the year actually played out, in plain football language.</CardDescription>
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
                <CardDescription>Top performers, disappointment, and board verdict.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <KeyLine label="Top scorer" value={performerLabel(seasonOutcome?.topScorer)} />
                <KeyLine label="Top assister" value={performerLabel(seasonOutcome?.topAssister)} />
                <KeyLine label="Best player" value={performerLabel(seasonOutcome?.bestPlayer)} />
                <KeyLine label="Breakout player" value={performerLabel(seasonOutcome?.breakoutPlayer)} />
                <KeyLine label="Biggest disappointment" value={seasonOutcome?.disappointment ?? "n/a"} />
                <KeyLine label="Transfer verdict" value={seasonOutcome?.transferVerdict ?? "n/a"} />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Why it happened</p>
                  <p className="mt-2 text-sm leading-7 text-slate-700">
                    {[
                      `League swing: ${(calculation?.pointsSwing ?? 0) >= 0 ? "+" : ""}${calculation?.pointsSwing ?? 0}`,
                      `Squad balance ${calculation?.squadBalance ?? result.squad_balance_score}/100`,
                      `Tactical fit ${calculation?.tactical ?? result.tactical_fit_score}/100`,
                      `Injury risk ${calculation?.injuryRisk ?? result.injury_vulnerability_score}/100`,
                    ].join(" | ")}
                  </p>
                </div>
              </CardContent>
            </Card>
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

        <section className="grid gap-6 lg:grid-cols-2">
          <CupPathCard title="DFB-Pokal path" rounds={seasonOutcome?.pokal?.rounds ?? []} fallback={seasonOutcome?.pokal?.round ?? "Not recorded"} />
          <CupPathCard title="Champions League path" rounds={seasonOutcome?.ucl?.rounds ?? []} fallback={seasonOutcome?.ucl?.round ?? "Not recorded"} />
        </section>

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
              <CardDescription>What the board thought of the window.</CardDescription>
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
              <MiniLine label="Disappointment" value={seasonOutcome?.disappointment ?? "n/a"} />
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[60%] truncate font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function MiniLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="truncate text-sm font-semibold text-slate-950">{value}</span>
    </div>
  );
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
