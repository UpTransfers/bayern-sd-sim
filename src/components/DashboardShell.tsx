"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RefreshCw, ShieldCheck, Users, Target, BarChart3, Undo2, Sparkles, ChevronRight, Save } from "lucide-react";
import { BayernBadge } from "@/components/BayernBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/StatCard";
import { TaskCard } from "@/components/TaskCard";
import { PreSeasonReview } from "@/components/PreSeasonReview";
import { SquadTable } from "@/components/SquadTable";
import { LoanPlanner } from "@/components/LoanPlanner";
import { TransferSearch } from "@/components/TransferSearch";
import { BoardConversationModal } from "@/components/BoardConversationModal";
import { FormationBuilder } from "@/components/FormationBuilder";
import { BoardInbox } from "@/components/BoardInbox";
import { DecisionFeed } from "@/components/DecisionFeed";
import { FinancialSummary } from "@/components/FinancialSummary";
import { SquadNeedsPanel } from "@/components/SquadNeedsPanel";
import { SourceAttribution } from "@/components/SourceAttribution";
import { DataHealthBadge } from "@/components/DataHealthBadge";
import type { SetPieceSettings, SimulationSummary, TaskId } from "@/lib/types";
import { formatCurrencyMillions } from "@/lib/utils";
import { formationSlots, type FormationKey } from "@/lib/simulation/formations";
import { defaultTactics, normalizeTactics } from "@/lib/simulation/tactics";
import type { ReactNode } from "react";
import type { TransferSearchResult } from "@/components/TransferSearch";

const taskDetails: Record<
  TaskId,
  { number: string; title: string; description: string; icon: ReactNode }
> = {
  preseason: {
    number: "01",
    title: "Pre-Season Review",
    description: "Review the club briefing, current league context, and board objectives.",
    icon: <Target className="h-5 w-5 text-[#b80d19]" />,
  },
  sell: {
    number: "02",
    title: "Sell Players",
    description: "Move surplus players and recover budget without breaking squad balance.",
    icon: <ShieldCheck className="h-5 w-5 text-[#b80d19]" />,
  },
  loan: {
    number: "03",
    title: "Loan Players",
    description: "Send young or blocked players out for realistic development minutes.",
    icon: <Users className="h-5 w-5 text-[#b80d19]" />,
  },
  sign: {
    number: "04",
    title: "Sign Players",
    description: "Search real players from free sources and complete a Bayern-style transfer window.",
    icon: <Sparkles className="h-5 w-5 text-[#b80d19]" />,
  },
  formation: {
    number: "05",
    title: "Set Formation",
    description: "Choose a tactical shape, assign the XI, and lock the season plan.",
    icon: <BarChart3 className="h-5 w-5 text-[#b80d19]" />,
  },
};

export function DashboardShell({ simulationId }: { simulationId: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskId>("preseason");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<TransferSearchResult[]>([]);
  const [formation, setFormation] = useState<FormationKey>("4-2-3-1");
  const [lineup, setLineup] = useState<Array<{ slot: string; playerId: string }>>([]);
  const [tacticsDraft, setTacticsDraft] = useState(defaultTactics);
  const [setPiecesDraft, setSetPiecesDraft] = useState<SetPieceSettings>(defaultSetPieces());
  const [missingSimulation, setMissingSimulation] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(200);
  const [selectedSellIds, setSelectedSellIds] = useState<string[]>([]);
  const [selectedLoanIds, setSelectedLoanIds] = useState<string[]>([]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [boardConversation, setBoardConversation] = useState<TransferSearchResult | null>(null);

  async function fetchSummary() {
    const response = await fetch(`/api/simulations/${simulationId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Could not load simulation");
    }
    const payload = (await response.json()) as SimulationSummary;
    setSummary(payload);
    setFormation((payload.lineup?.formation as FormationKey | undefined) ?? "4-2-3-1");
    setLineup(uniqueLineup((payload.lineup?.lineup_json as Array<{ slot: string; playerId: string }> | undefined) ?? []));
    setTacticsDraft(normalizeTactics(payload.simulation.tactics_json ?? null));
    setSetPiecesDraft(payload.simulation.set_pieces_json ?? defaultSetPieces());
    setBudgetDraft(payload.simulation.selected_budget_eur);
    const nextTask = (["preseason", "sell", "loan", "sign", "formation"] as TaskId[]).find(
      (task) => !payload.simulation.completed_tasks.includes(task),
    );
    setActiveTask(nextTask ?? "formation");
    setLoading(false);
  }

  const searchPlayers = useCallback(async () => {
    setSearchLoading(true);
    try {
      const response = await fetch(`/api/search/players?query=${encodeURIComponent(searchQuery)}&simulationId=${encodeURIComponent(simulationId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { results: TransferSearchResult[] };
      setSearchResults(payload.results);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, simulationId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/simulations/${simulationId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (response.status === 404) {
            if (alive) {
              setMissingSimulation(true);
              setLoading(false);
            }
            return;
          }
          throw new Error("Could not load simulation");
        }
        const payload = (await response.json()) as SimulationSummary;
        if (!alive) return;
        setMissingSimulation(false);
        setSummary(payload);
        setFormation((payload.lineup?.formation as FormationKey | undefined) ?? "4-2-3-1");
        setLineup(uniqueLineup((payload.lineup?.lineup_json as Array<{ slot: string; playerId: string }> | undefined) ?? []));
        setTacticsDraft(normalizeTactics(payload.simulation.tactics_json ?? null));
        setSetPiecesDraft(payload.simulation.set_pieces_json ?? defaultSetPieces());
        setBudgetDraft(payload.simulation.selected_budget_eur);
        const nextTask = (["preseason", "sell", "loan", "sign", "formation"] as TaskId[]).find(
          (task) => !payload.simulation.completed_tasks.includes(task),
        );
        setActiveTask(nextTask ?? "formation");
      } catch {
        if (alive) setLoading(false);
        return;
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [simulationId]);

  useEffect(() => {
    if (activeTask === "sign" && !searchResults.length && !searchLoading) {
      const timeout = window.setTimeout(() => {
        void searchPlayers();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [activeTask, searchPlayers, searchLoading, searchResults.length]);

  async function runAction(action: Record<string, unknown>) {
    setActionLoading(String(action.action ?? "action"));
    try {
      const response = await fetch(`/api/simulations/${simulationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Action failed");
      }
      await fetchSummary();
      return payload as { ok?: boolean; processed?: number; blocked?: number; budgetDelta?: number };
    } finally {
      setActionLoading(null);
    }
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const endpoints = [
        "/api/sync/openligadb",
        "/api/sync/wikidata",
        "/api/sync/football-data",
        "/api/sync/thesportsdb",
      ];
      await Promise.allSettled(endpoints.map((endpoint) => fetch(endpoint, { method: "POST" })));
      await fetchSummary();
    } finally {
      setSyncing(false);
    }
  }

  async function updateBudget() {
    const payload = await runAction({ action: "updateBudget", budget: budgetDraft });
    setActionNotice(`Budget updated to EUR ${formatCurrencyMillions(budgetDraft)}.`);
    return payload;
  }

  const completedCount = summary?.simulation.completed_tasks.length ?? 0;
  const readinessIssues = useMemo(
    () =>
      computeSimulationReadinessIssues(summary, {
        formation,
        lineup,
        tactics: tacticsDraft,
        setPieces: setPiecesDraft,
      }),
    [summary, formation, lineup, tacticsDraft, setPiecesDraft],
  );
  const canSimulate = readinessIssues.length === 0;
  const taskFinishLabel =
    activeTask === "preseason"
      ? "Mark preseason complete"
      : activeTask === "sell"
      ? "Mark sales complete"
      : activeTask === "loan"
      ? "Mark loan planning complete"
      : activeTask === "sign"
      ? "Mark transfer market complete"
      : "Mark tactical setup complete";
  const boardMessages = useMemo(() => {
    if (!summary) return [];
    const items = [];
    if (summary.soldPlayerIds.length > 3) {
      items.push({ tone: "warn" as const, title: "Board caution", body: "You have sold a significant portion of the first-team core." });
    }
    if (summary.signings.length) {
      items.push({ tone: "good" as const, title: "Transfer desk", body: "The board acknowledges the completed signings and the direction of travel." });
    }
    if (summary.simulation.remaining_budget_eur < summary.simulation.selected_budget_eur * 0.25) {
      items.push({ tone: "warn" as const, title: "Budget watch", body: "Budget discipline is becoming a board-level issue." });
    }
    if (!items.length) {
      items.push({ tone: "neutral" as const, title: "Briefing", body: "No major reactions yet. Use the task cards to create movement." });
    }
    return items;
  }, [summary]);

  const transferSpend = summary?.signings.reduce((sum, item) => sum + item.fee_eur, 0) ?? 0;
  const transferIncome = summary?.decisions.filter((item) => item.decision_type === "sell").reduce((sum, item) => sum + (item.fee_eur ?? 0), 0) ?? 0;
  const squadSize = summary?.activeRoster.length ?? 0;
  const dataHealthStatus = summary?.sourceHealth ?? [];
  const lastSync = [...dataHealthStatus]
    .map((source) => source.last_checked_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  const lineupSlots = formationSlots(formation);

  function rosterNeeds() {
    if (!summary) return [];
    const players = summary.activeRoster.map((entry) =>
      entry.kind === "catalog" ? entry.player : { age: entry.player.age, position: entry.player.position },
    );
    const count = (matcher: RegExp) => players.filter((player) => matcher.test((player.position ?? "").toString())).length;
    return [
      { label: "Goalkeeper", value: count(/GK|Goalkeeper/i) < 2 ? 90 : count(/GK|Goalkeeper/i) < 3 ? 55 : 20 },
      { label: "Center back", value: count(/CB|DEF/i) < 4 ? 82 : 32 },
      { label: "Midfield depth", value: count(/MID|CM|DM/i) < 5 ? 78 : 28 },
      { label: "Attacking width", value: count(/WING|LW|RW/i) < 3 ? 74 : 24 },
    ];
  }

  async function handleSell(playerId: string) {
    await runAction({ action: "sell", playerId });
    setActionNotice("Single player sold.");
  }

  async function handleLoan(playerId: string) {
    await runAction({ action: "loan", playerId });
    setActionNotice("Single player loaned.");
  }

  async function handleKeep(playerId: string) {
    await runAction({ action: "keep", playerId });
    setActionNotice("Player kept in the squad.");
  }

  async function handleDevelop(playerId: string) {
    await runAction({ action: "development", playerId });
    setActionNotice("Player marked for development.");
  }

  async function handleBulkSell(playerIds: string[]) {
    if (!playerIds.length) return;
    const payload = await runAction({ action: "sell", playerIds });
    setSelectedSellIds([]);
    setActionNotice(`Sold ${payload?.processed ?? playerIds.length} players.`);
  }

  async function handleBulkLoan(playerIds: string[]) {
    if (!playerIds.length) return;
    const payload = await runAction({ action: "loan", playerIds });
    setSelectedSellIds([]);
    setSelectedLoanIds([]);
    setActionNotice(`Loaned ${payload?.processed ?? playerIds.length} players.`);
  }

  async function handleBulkKeep(playerIds: string[]) {
    if (!playerIds.length) return;
    const payload = await runAction({ action: "keep", playerIds });
    setSelectedLoanIds([]);
    setActionNotice(`Kept ${payload?.processed ?? playerIds.length} players.`);
  }

  async function handleBulkDevelop(playerIds: string[]) {
    if (!playerIds.length) return;
    const payload = await runAction({ action: "development", playerIds });
    setSelectedLoanIds([]);
    setActionNotice(`Marked ${payload?.processed ?? playerIds.length} players for development.`);
  }

  async function handleCompleteTask(taskId: TaskId) {
    await runAction({ action: "completeTask", taskId });
  }

  async function handleSearchAndSign(result: TransferSearchResult) {
    const requiresConversation =
      result.lowConfidence ||
      result.approval?.stage === "negotiation" ||
      result.approval?.stage === "board_review" ||
      Boolean(result.approval?.hardBlock);

    if (requiresConversation) {
      setBoardConversation(result);
      return;
    }

    await runAction({ action: "sign", player: result });
  }

  async function handleBulkSearchSign(results: TransferSearchResult[]) {
    if (!results.length) return;
    const payload = await runAction({
      action: "sign",
      players: results,
    });
    const blocked = payload?.blocked ?? 0;
    const processed = payload?.processed ?? results.length;
    setActionNotice(blocked ? `Signed ${processed} players, ${blocked} blocked by budget or approval.` : `Signed ${processed} players.`);
  }

  async function proceedWithBoardConversation() {
    if (!boardConversation) return;
    await runAction({
      action: "sign",
      player: boardConversation,
      boardResponse: {
        stage: boardConversation.approval?.stage ?? "greenlight",
        note: boardConversation.approval?.conversationSummary ?? (boardConversation.lowConfidence ? "Low-confidence scouting estimate accepted." : "Proceeding without further negotiation."),
      },
    });
    setBoardConversation(null);
  }

  async function convinceBoardConversation() {
    if (!boardConversation) return;
    await runAction({
      action: "sign",
      player: boardConversation,
      boardResponse: {
        stage: "convince",
        note: `Director presentation: ${boardConversation.name} is framed as a strategic Bayern fit, not a panic buy. Wage ladder and squad role must stay controlled.`,
      },
    });
    setBoardConversation(null);
  }

  async function handleFormationSave() {
    const payload = await runAction({
      action: "setFormation",
      formation,
      lineup,
    });
    setActionNotice(`Formation saved: ${formation} with ${lineup.length} players.`);
    return payload;
  }

  async function handleTacticsSave() {
    await runAction({
      action: "setTactics",
      tactics: tacticsDraft,
    });
    setActionNotice("Tactics saved.");
  }

  function handleTacticsReset() {
    setTacticsDraft(defaultTactics);
    setActionNotice("Tactics reset to the Kompany default.");
  }

  async function handleSetPiecesSave() {
    await runAction({
      action: "setSetPieces",
      setPieces: setPiecesDraft,
    });
    setActionNotice("Set pieces saved.");
  }

  function autoPickBestXI() {
    if (!summary) return;
    const roster = summary.activeRoster;
    const used = new Set<string>();
    const choose = (pattern: RegExp) => {
      const preferred = roster.find((entry) => !used.has(entry.id) && pattern.test(entry.player.position ?? ""));
      if (preferred) {
        used.add(preferred.id);
        return preferred.id;
      }
      const fallback = roster.find((entry) => !used.has(entry.id));
      if (fallback) {
        used.add(fallback.id);
        return fallback.id;
      }
      return roster[0]?.id ?? "";
    };
    const next = lineupSlots.map((slot) => {
      const lookup =
        slot === "GK"
          ? choose(/GK|Goalkeeper/i)
          : /LB|LWB/.test(slot)
          ? choose(/DEF|LB|LWB/i)
          : /CB/.test(slot)
          ? choose(/CB|DEF/i)
          : /RB|RWB/.test(slot)
          ? choose(/DEF|RB|RWB/i)
          : /DM/.test(slot)
          ? choose(/DM|MID/i)
          : /CM|LM|RM|AM/.test(slot)
          ? choose(/MID|CM|DM|AM|LM|RM/i)
          : /W/.test(slot)
          ? choose(/WING|LW|RW|FWD/i)
          : choose(/FWD|ST|ATT/i);
      return { slot, playerId: lookup };
    });
    setLineup(uniqueLineup(next));
  }

  function resetLineup() {
    setLineup([]);
  }

  async function simulateSeason() {
    if (!canSimulate) {
      setActionNotice("Finish and save formation, tactics, XI, and set-piece roles first.");
      return;
    }
    await runAction({ action: "simulate" });
    router.push(`/results?simulationId=${simulationId}`);
  }

  async function undoLast() {
    await runAction({ action: "undoLast" });
    setActionNotice("Last action undone.");
  }

  function uniqueLineup(items: Array<{ slot: string; playerId: string }>) {
    const seenSlots = new Set<string>();
    const seenPlayers = new Set<string>();
    return items.filter((item) => {
      if (seenSlots.has(item.slot) || seenPlayers.has(item.playerId)) return false;
      seenSlots.add(item.slot);
      seenPlayers.add(item.playerId);
      return true;
    });
  }

  if (loading || !summary) {
    if (missingSimulation) {
      return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#faf7f7,white)] px-4 py-10">
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-5 rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <BayernBadge />
            <div className="space-y-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-950">This simulation save is gone</h1>
              <p className="text-base leading-7 text-slate-600">
                The route you opened points to a simulation ID that is not in the local save anymore. Start a new simulation to continue testing.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => router.push("/")}>Start new simulation</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#faf7f7,white)] p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-[34rem] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(184,13,25,0.08),transparent_24%),linear-gradient(180deg,#f7f7fb,white)] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-[#b80d19]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <BayernBadge />
            <div>
              <p className="text-lg font-black tracking-tight">FC Bayern Sporting Director Simulator</p>
              <p className="text-sm text-white/80">Sporting Director: {summary.simulation.director_name} | Season: {summary.simulation.season_label}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white/12 text-white border-white/20">Budget {formatCurrencyMillions(summary.simulation.remaining_budget_eur)}</Badge>
            <Badge className="bg-white/12 text-white border-white/20">Squad {squadSize}</Badge>
            <Badge className="bg-white/12 text-white border-white/20">Tasks {completedCount}/5</Badge>
            <Badge className="bg-white/12 text-white border-white/20">Board {summary.simulation.board_confidence}%</Badge>
            <DataHealthBadge sources={dataHealthStatus} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-5">
          <StatCard label="Budget" value={formatCurrencyMillions(summary.simulation.remaining_budget_eur)} sublabel={`Starting ${formatCurrencyMillions(summary.simulation.selected_budget_eur)}`} tone="gold" />
          <StatCard label="Squad" value={String(squadSize)} sublabel="Active players plus signings" />
          <StatCard label="Tasks" value={`${completedCount}/5`} sublabel="Optional checklist" progress={(completedCount / 5) * 100} />
          <StatCard label="Board" value={`${summary.simulation.board_confidence}%`} sublabel="Board confidence" progress={summary.simulation.board_confidence} tone="success" />
          <StatCard label="Data" value={`${summary.simulation.data_confidence}%`} sublabel="Data confidence" progress={summary.simulation.data_confidence} tone={summary.simulation.data_confidence >= 70 ? "success" : "warning"} />
        </section>

        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 grid gap-4 lg:grid-cols-5">
          {(Object.keys(taskDetails) as TaskId[]).map((taskId) => {
            const detail = taskDetails[taskId];
            const status = summary.simulation.completed_tasks.includes(taskId)
              ? "Complete"
              : summary.simulation.current_task === taskId
              ? "In Progress"
              : "Pending";
            const progress = summary.simulation.completed_tasks.includes(taskId)
              ? 100
              : summary.simulation.current_task === taskId
              ? 62
              : 20;
            return (
              <TaskCard
                key={taskId}
                number={detail.number}
                title={detail.title}
                description={detail.description}
                icon={detail.icon}
                status={status}
                progress={progress}
                active={activeTask === taskId}
                onClick={() => setActiveTask(taskId)}
              />
            );
          })}
        </motion.section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            <Card className="bg-white/80">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Command center</p>
                  <p className="mt-1 text-xl font-black text-slate-950">Simulate 2026-27 Season</p>
                  <p className="mt-1 text-sm text-slate-600">
                    The season only unlocks after formation, tactics, starting XI, and set-piece roles have been saved.
                  </p>
                  {actionNotice ? (
                    <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {actionNotice}
                    </p>
                  ) : null}
                </div>
                <div className="grid w-full gap-3 lg:w-auto lg:min-w-[28rem]">
                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_7rem_auto] sm:items-center">
                    <input
                      type="range"
                      min={0}
                      max={500}
                      step={5}
                      value={budgetDraft}
                      onChange={(event) => setBudgetDraft(Number(event.target.value))}
                      className="accent-[#b80d19]"
                    />
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={budgetDraft}
                      onChange={(event) => setBudgetDraft(Math.max(0, Math.min(500, Number(event.target.value) || 0)))}
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                      aria-label="Budget in millions of euros"
                    />
                    <Button variant="outline" onClick={updateBudget} disabled={actionLoading !== null}>
                      <Save className="mr-2 h-4 w-4" />
                      Budget
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button variant="secondary" className="w-full sm:w-auto" onClick={syncAll} disabled={syncing}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                      Sync real data
                    </Button>
                    <Button variant="outline" className="w-full sm:w-auto" onClick={undoLast} disabled={actionLoading !== null || summary.simulation.status === "simulated"}>
                      <Undo2 className="mr-2 h-4 w-4" />
                      Undo last
                    </Button>
                    <Button
                      onClick={simulateSeason}
                      disabled={!canSimulate || actionLoading !== null}
                      className="w-full shadow-[0_18px_40px_rgba(212,175,55,0.24)] sm:w-auto"
                    >
                      Simulate 2026-27 Season
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {readinessIssues.length ? (
              <Card className="border-amber-200 bg-amber-50/70">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Simulation locked</p>
                  <p className="mt-1 text-sm text-amber-900">Finish these items before running the season:</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {readinessIssues.map((issue) => (
                      <Badge key={issue} tone="warning" className="normal-case tracking-normal">
                        {issue}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {activeTask === "preseason" ? (
              <PreSeasonReview
                club={summary.club}
                standing={summary.currentStanding}
                recentMatches={summary.recentMatches}
                completed={summary.simulation.completed_tasks.includes("preseason")}
                onComplete={() => handleCompleteTask("preseason")}
              />
            ) : null}

            {activeTask === "sell" ? (
              <SquadTable
                roster={summary.sellRoster}
                onSell={handleSell}
                onLoan={handleLoan}
                onKeep={handleKeep}
                onMarkDevelopment={handleDevelop}
                selectedIds={selectedSellIds}
                onToggleSelected={(id) =>
                  setSelectedSellIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
                }
                onBulkSell={handleBulkSell}
                onBulkLoan={handleBulkLoan}
                onClearSelection={() => setSelectedSellIds([])}
              />
            ) : null}

            {activeTask === "loan" ? (
              <LoanPlanner
                loanReturns={summary.loanReturnPool}
                youthProspects={summary.youthProspects}
                onLoan={handleLoan}
                onKeep={handleKeep}
                onSell={handleSell}
                onMarkDevelopment={handleDevelop}
                selectedIds={selectedLoanIds}
                onToggleSelected={(id) =>
                  setSelectedLoanIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
                }
                onBulkLoan={handleBulkLoan}
                onBulkKeep={handleBulkKeep}
                onBulkSell={handleBulkSell}
                onBulkDevelopment={handleBulkDevelop}
                onClearSelection={() => setSelectedLoanIds([])}
              />
            ) : null}

            {activeTask === "sign" ? (
              <TransferSearch
                query={searchQuery}
                onQueryChange={setSearchQuery}
                results={searchResults}
                onSearch={searchPlayers}
                loading={searchLoading}
                onSign={handleSearchAndSign}
                onSignMany={handleBulkSearchSign}
              />
            ) : null}

            {activeTask === "formation" ? (
              <FormationBuilder
                formation={formation}
                roster={summary.activeRoster}
                lineup={lineup}
                tactics={tacticsDraft}
                onChangeFormation={setFormation}
                onChangeSlot={(slot, playerId) =>
                  setLineup((current) => {
                    const next = current.filter((item) => item.slot !== slot && item.playerId !== playerId);
                    if (playerId) next.push({ slot, playerId });
                    return uniqueLineup(next);
                  })
                }
                onAutoPick={autoPickBestXI}
                onReset={resetLineup}
                onSave={handleFormationSave}
                onTacticsChange={setTacticsDraft}
                onSaveTactics={handleTacticsSave}
                onResetTactics={handleTacticsReset}
                setPieces={setPiecesDraft}
                onSetPiecesChange={setSetPiecesDraft}
                onSaveSetPieces={handleSetPiecesSave}
              saveNotice={actionNotice?.startsWith("Formation saved") ? actionNotice : null}
              tacticsNotice={actionNotice === "Tactics saved." ? actionNotice : null}
              setPiecesNotice={actionNotice === "Set pieces saved." ? actionNotice : null}
            />
          ) : null}

            {!summary.simulation.completed_tasks.includes(activeTask) ? (
              <Card className="border-slate-200 bg-white/85">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Optional checklist</p>
                    <p className="mt-1 text-sm text-slate-600">Mark the section complete when you are done. Simulation does not depend on it.</p>
                  </div>
                  <Button variant="outline" onClick={() => handleCompleteTask(activeTask)} disabled={actionLoading !== null}>
                    {taskFinishLabel}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <SourceAttribution sources={dataHealthStatus} lastSyncedAt={lastSync} />
            <BoardInbox messages={boardMessages} />
            <FinancialSummary
              startingBudget={summary.simulation.selected_budget_eur}
              remainingBudget={summary.simulation.remaining_budget_eur}
              transferSpend={transferSpend}
              transferIncome={transferIncome}
            />
            <SquadNeedsPanel needs={rosterNeeds()} />
            <DecisionFeed events={summary.feed} />
          </div>
        </section>
      </main>
      <BoardConversationModal
        transfer={boardConversation}
        lowConfidence={boardConversation?.lowConfidence ?? false}
        onClose={() => setBoardConversation(null)}
        onProceed={proceedWithBoardConversation}
        onConvince={convinceBoardConversation}
      />
    </div>
  );
}

function defaultSetPieces(): SetPieceSettings {
  return {
    captainId: null,
    penaltyTakerId: null,
    freeKickTakerId: null,
    cornerTakerId: null,
  };
}

function computeSimulationReadinessIssues(
  summary: SimulationSummary | null,
  current: {
    formation: string;
    lineup: Array<{ slot: string; playerId: string }>;
    tactics: typeof defaultTactics;
    setPieces: SetPieceSettings;
  },
) {
  if (!summary) return ["Load the simulation first."];

  const savedLineup = Array.isArray(summary.lineup?.lineup_json)
    ? (summary.lineup?.lineup_json as Array<{ slot?: unknown; playerId?: unknown }>).filter(
        (item): item is { slot: string; playerId: string } => typeof item.slot === "string" && typeof item.playerId === "string",
      )
    : [];
  const savedFormation = summary.lineup?.formation ?? summary.simulation.formation ?? "";
  const savedTactics = summary.simulation.tactics_json;
  const savedSetPieces = summary.simulation.set_pieces_json;
  const savedLineupKey = lineupSignature(savedFormation, savedLineup);
  const currentLineupKey = lineupSignature(current.formation, current.lineup);

  const issues = new Set<string>();
  if (!savedFormation) issues.add("Choose and save a formation first.");
  if (!savedLineup.length || savedLineup.length < formationSlots(current.formation as FormationKey).length)
    issues.add("Fill and save the starting XI.");
  if (!savedTactics) issues.add("Save tactical instructions first.");
  if (!savedSetPieces) {
    issues.add("Choose captain and set-piece roles first.");
  } else {
    if (!savedSetPieces.captainId) issues.add("Choose a captain from the starting XI.");
    if (!savedSetPieces.penaltyTakerId) issues.add("Choose a penalty taker from the starting XI.");
    if (!savedSetPieces.freeKickTakerId) issues.add("Choose a free-kick taker from the starting XI.");
    if (!savedSetPieces.cornerTakerId) issues.add("Choose a corner taker from the starting XI.");
  }
  if (currentLineupKey !== savedLineupKey) issues.add("Save the current starting XI.");
  if (JSON.stringify(current.tactics) !== JSON.stringify(savedTactics ?? null)) issues.add("Save the current tactics.");
  if (JSON.stringify(current.setPieces) !== JSON.stringify(savedSetPieces ?? null)) issues.add("Save the current set-piece roles.");
  return [...issues];
}

function lineupSignature(formation: string, lineup: Array<{ slot: string; playerId: string }>) {
  return `${formation}|${[...lineup]
    .filter((item) => item.slot && item.playerId)
    .sort((a, b) => a.slot.localeCompare(b.slot))
    .map((item) => `${item.slot}:${item.playerId}`)
    .join(",")}`;
}
