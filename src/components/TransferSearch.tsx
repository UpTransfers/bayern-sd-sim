import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrencyMillions } from "@/lib/utils";

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
  onSign,
  onSignMany,
  loading,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  results: TransferSearchResult[];
  onSearch: () => void;
  onSign: (result: TransferSearchResult) => void;
  onSignMany?: (results: TransferSearchResult[]) => void | Promise<void>;
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
      <CardHeader>
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
          <Button onClick={onSearch} disabled={loading}>
            <Search className="mr-2 h-4 w-4" />
            {loading ? "Searching" : "Search"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {positionFilters.map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={positionFilter === filter ? "default" : "outline"}
              onClick={() => setPositionFilter(filter)}
            >
              {filter}
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>
            Showing {filteredResults.length} of {results.length} players
          </span>
          <span>{positionFilter === "All" ? "All positions" : `${positionFilter} filter active`}</span>
        </div>

        {selectedIds.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-medium text-slate-700">{selectedIds.length} selected for bulk signing</p>
            <div className="flex flex-wrap gap-2">
              {onSignMany ? (
                <Button
                  size="sm"
                  onClick={() =>
                    void (async () => {
                      await onSignMany(selectedResults);
                      setSelectedIds([]);
                    })()
                  }
                  disabled={loading || !selectedResults.length}
                >
                  Sign selected
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3">
          {filteredResults.length ? (
            filteredResults.map((result) => (
              <div key={result.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <label className="mt-0.5 flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 p-2">
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
                      <p className="truncate font-semibold text-slate-950">{result.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {result.club ?? "Club unavailable"} | #{result.shirtNumber ?? "N/A"} | {result.position ?? "Unknown"}
                      </p>
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

                <p className="mt-3 text-sm text-slate-600">{result.verdict ?? result.characterNote ?? "No scouting note available."}</p>
                {result.approval?.positionContext ? <p className="mt-2 text-xs text-slate-500">{result.approval.positionContext}</p> : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={approvalTone(result.approval?.stage, result.approval?.total)}>{result.approval?.decision ?? "Scout view"}</Badge>
                    {result.approval?.positionContext ? <Badge tone="muted">{result.approval.positionContext}</Badge> : null}
                    {result.approval?.vetoReasons?.length ? (
                      <Badge tone="warning">{result.approval.vetoReasons[0]}</Badge>
                    ) : null}
                  </div>
                  <Button size="sm" onClick={() => onSign(result)} disabled={loading}>
                    Sign player
                  </Button>
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
