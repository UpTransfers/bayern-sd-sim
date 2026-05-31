import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clamp, formatCurrencyMillions } from "@/lib/utils";

export type TransferSearchResult = {
  id: string;
  name: string;
  club: string | null;
  shirtNumber: number | null;
  position: string | null;
  nationality: string | null;
  currentClub: string | null;
  age: number | null;
  fee: number;
  fit: number;
  need: number;
  source: string;
  confidence: number;
  lowConfidence: boolean;
  currentWage?: string | null;
  bayernDemand?: string | null;
  wageConcern?: "Low" | "Medium" | "High" | "Very High";
  foot?: string | null;
  contract?: string | null;
  ability?: number | null;
  bayernFit?: number | null;
  rating?: number | null;
  form?: number | null;
  keyTraits?: string[];
  inPossessionFit?: string | null;
  outOfPossessionFit?: string | null;
  characterNote?: string | null;
  realism?: string | null;
  verdict?: string | null;
  approval?: {
    total: number;
    decision: string;
    stage?: "greenlight" | "negotiation" | "board_review" | "blocked";
    positionContext?: string;
    conversationSummary?: string;
    negotiationPath?: string;
    hardBlock?: boolean;
    vetoReasons: string[];
    wagePressureNote: string;
    openingOffer?: string;
    counterOffer?: string;
    wageCeiling?: string;
    sellerStance?: string;
  };
  raw: unknown;
};

const positionFilters = ["All", "GK", "CB", "RB", "LB", "DM", "CM", "AM", "LW", "RW", "ST"];
type ApprovalStage = "greenlight" | "negotiation" | "board_review" | "blocked";

export function TransferSearch({
  query,
  onQueryChange,
  results,
  onSearch,
  onOpenNegotiation,
  onInspectPlayer,
  loading,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  results: TransferSearchResult[];
  onSearch: () => void;
  onOpenNegotiation: (result: TransferSearchResult) => void;
  onInspectPlayer?: (result: TransferSearchResult) => void;
  loading?: boolean;
}) {
  const [positionFilter, setPositionFilter] = useState("All");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filteredResults = useMemo(
    () =>
      results.filter((result) => {
        if (positionFilter === "All") return true;
        const value = (result.position ?? "").toUpperCase();
        return value.includes(positionFilter);
      }),
    [positionFilter, results],
  );
  const selectedResults = useMemo(
    () => filteredResults.filter((result) => selectedIds.includes(result.id)),
    [filteredResults, selectedIds],
  );

  return (
    <Card className="bg-white/97">
      <CardHeader className="space-y-2">
        <CardTitle>Transfer Market</CardTitle>
        <CardDescription>Targets are shown with fee, ability, Bayern fit, realism, and approval state.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
            }}
            placeholder="Search by name, club, trait, verdict, or position"
          />
          <Button className="w-full sm:w-auto" onClick={onSearch} disabled={loading}>
            <Search className="mr-2 h-4 w-4" />
            {loading ? "Searching" : "Search"}
          </Button>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 pr-1 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {positionFilters.map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={positionFilter === filter ? "default" : "outline"}
              onClick={() => setPositionFilter(filter)}
              className="shrink-0 whitespace-nowrap"
            >
              {filter}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span>
            Showing {filteredResults.length} of {results.length} players
          </span>
          <span>{positionFilter === "All" ? "All positions" : `${positionFilter} filter active`}</span>
        </div>

        {selectedIds.length ? (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-slate-700">{selectedIds.length} selected for review</p>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              {onOpenNegotiation ? (
                <Button
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    const firstSelected = selectedResults[0];
                    if (!firstSelected) return;
                    onOpenNegotiation(firstSelected);
                    setSelectedIds([]);
                  }}
                  disabled={loading || !selectedResults.length}
                >
                  Open talks
                </Button>
              ) : null}
              <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3">
          {filteredResults.length ? (
            filteredResults.map((result) => (
              <div key={result.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <label className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(result.id)}
                        onChange={() =>
                          setSelectedIds((current) =>
                            current.includes(result.id) ? current.filter((id) => id !== result.id) : [...current, result.id],
                          )
                        }
                        aria-label={`Select ${result.name}`}
                      />
                    </label>
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-slate-950">{result.name}</p>
                      <p className="mt-1 break-words text-[11px] uppercase tracking-[0.08em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
                        {result.club ?? "Club unavailable"} | #{result.shirtNumber ?? "N/A"} | {result.position ?? "Unknown"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {transferBadges(result).slice(0, 3).map((badge) => (
                          <Badge key={badge.label} tone={badge.tone} className="normal-case tracking-normal">
                            {badge.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="muted">{formatCurrencyMillions(result.fee)}</Badge>
                    <Badge tone={approvalTone(result.approval?.stage, result.approval?.total)}>{result.approval?.decision ?? "Scout view"}</Badge>
                    <Badge tone={result.realism === "Realistic" ? "success" : result.realism === "Dream" ? "muted" : "gold"}>
                      {result.realism ?? "Unknown"}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-slate-50 px-2 py-1">Age {result.age ?? "?"}</span>
                  <span className="rounded-full bg-slate-50 px-2 py-1">Foot {result.foot ?? "?"}</span>
                  <span className="rounded-full bg-slate-50 px-2 py-1">Contract {result.contract ?? "n/a"}</span>
                  <span className="rounded-full bg-slate-50 px-2 py-1">Role {result.position ?? "Unknown"}</span>
                </div>

                {result.keyTraits?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.keyTraits.slice(0, 4).map((trait) => (
                      <Badge key={trait} tone="muted" className="normal-case tracking-normal">
                        {trait}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 grid gap-2 min-[430px]:grid-cols-2 xl:grid-cols-4">
                  <ImpactChip label="Need" value={result.need} tone="success" />
                  <ImpactChip label="Approval" value={result.approval?.total ?? result.confidence} tone={result.approval?.stage === "blocked" ? "warning" : "gold"} />
                  <ImpactChip label="Budget hit" value={Math.max(0, Math.min(100, Math.round(result.fee)))} tone="muted" />
                  <ImpactChip label="Wage caution" value={wageCautionValue(result)} tone={wageTone(result)} />
                </div>

                <p className="mt-3 text-sm text-slate-600">{result.verdict ?? result.characterNote ?? "No scouting note available."}</p>
                {result.approval?.positionContext ? <p className="mt-2 text-xs text-slate-500">{result.approval.positionContext}</p> : null}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={approvalTone(result.approval?.stage, result.approval?.total)}>{result.approval?.decision ?? "Scout view"}</Badge>
                    {result.approval?.positionContext ? <Badge tone="muted">{result.approval.positionContext}</Badge> : null}
                    {result.approval?.vetoReasons?.length ? (
                      <Badge tone="warning">{result.approval.vetoReasons[0]}</Badge>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    {onInspectPlayer ? (
                      <Button size="sm" className="w-full sm:w-auto" variant="outline" onClick={() => onInspectPlayer(result)} disabled={loading}>
                        Inspect
                      </Button>
                    ) : null}
                    <Button size="sm" className="w-full sm:w-auto" onClick={() => onOpenNegotiation(result)} disabled={loading}>
                      Open talks
                    </Button>
                  </div>
                </div>
                {result.approval ? <p className="mt-2 text-xs text-slate-500">{result.approval.wagePressureNote}</p> : null}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              Empty search shows Bayern-level targets from the provided candidate list.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function approvalTone(stage?: ApprovalStage, total?: number) {
  if (stage === "greenlight") return "success";
  if (stage === "negotiation") return "gold";
  if (stage === "board_review") return total && total >= 55 ? "warning" : "muted";
  return "muted";
}

function wageCautionValue(result: TransferSearchResult) {
  const concernBase: Record<NonNullable<TransferSearchResult["wageConcern"]>, number> = {
    Low: 24,
    Medium: 46,
    High: 72,
    "Very High": 90,
  };
  const concern = result.wageConcern ?? "Medium";
  const base = concernBase[concern];
  const current = parseWageToMillions(result.currentWage);
  const demand = parseWageToMillions(result.bayernDemand);
  if (current !== null && demand !== null) {
    const ratio = demand / Math.max(current, 0.1);
    const ratioScore = clamp(Math.round((ratio - 1) * 35 + 25), 10, 100);
    return Math.round((base + ratioScore) / 2);
  }
  return base;
}

function wageTone(result: TransferSearchResult): "success" | "warning" | "gold" | "muted" {
  const value = wageCautionValue(result);
  if (value >= 80) return "warning";
  if (value >= 60) return "gold";
  if (value >= 35) return "muted";
  return "success";
}

function parseWageToMillions(value?: string | null) {
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

function ImpactChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "gold" | "muted";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
        <span>{label}</span>
        <Badge tone={tone} className="text-[9px]">
          {Math.round(value)}/100
        </Badge>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${
            tone === "success"
              ? "bg-emerald-500"
              : tone === "warning"
                ? "bg-red-500"
                : tone === "gold"
                  ? "bg-amber-400"
                  : "bg-slate-400"
          }`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function transferBadges(result: TransferSearchResult) {
  return [
    { label: importanceLabel(result), tone: importanceTone(result) },
    result.lowConfidence ? { label: "Simulator estimate", tone: "gold" as const } : { label: sourceLabel(result), tone: sourceTone(result) },
    result.wageConcern ? { label: result.wageConcern, tone: wageConcernTone(result.wageConcern) } : null,
  ].filter(Boolean) as Array<{ label: string; tone: "success" | "warning" | "gold" | "muted" }>;
}

function importanceLabel(result: TransferSearchResult) {
  if (result.need >= 82) return "Core";
  if (result.need >= 68) return "Starter";
  if (result.need >= 55) return "Rotation";
  return "Development";
}

function importanceTone(result: TransferSearchResult) {
  if (result.need >= 82) return "warning" as const;
  if (result.need >= 68) return "gold" as const;
  if (result.need >= 55) return "muted" as const;
  return "success" as const;
}

function sourceLabel(result: TransferSearchResult) {
  return result.source || "Curated fallback";
}

function sourceTone(result: TransferSearchResult) {
  if (result.lowConfidence) return "gold" as const;
  return "success" as const;
}

function wageConcernTone(value: NonNullable<TransferSearchResult["wageConcern"]>) {
  if (value === "Very High" || value === "High") return "warning" as const;
  if (value === "Medium") return "gold" as const;
  return "muted" as const;
}
