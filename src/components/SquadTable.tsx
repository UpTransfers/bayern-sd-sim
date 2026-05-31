import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DecisionImpactModal } from "@/components/DecisionImpactModal";
import { createSaleOffers, inferPlayerImportance } from "@/lib/football/negotiation";
import { previewLoanImpact, previewSaleImpact } from "@/lib/football/decisionImpact";
import { formatTransferValueRange } from "@/lib/utils";
import type { PlayerDetailBadge } from "@/components/PlayerDetailModal";
import type { SimulationRosterEntry } from "@/lib/types";

export function SquadTable({
  roster,
  onSell,
  onLoan,
  onKeep,
  onMarkDevelopment,
  selectedIds,
  onToggleSelected,
  onBulkSell,
  onBulkLoan,
  onClearSelection,
  onInspectPlayer,
}: {
  roster: SimulationRosterEntry[];
  onSell: (id: string) => void;
  onLoan: (id: string) => void;
  onKeep: (id: string) => void;
  onMarkDevelopment: (id: string) => void;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onBulkSell: (ids: string[]) => void;
  onBulkLoan: (ids: string[]) => void;
  onClearSelection: () => void;
  onInspectPlayer?: (entry: SimulationRosterEntry) => void;
}) {
  const selectedCount = selectedIds.length;
  const [previewState, setPreviewState] = useState<null | { entry: SimulationRosterEntry; action: "sell" | "loan" }>(null);

  const preview = useMemo(() => {
    if (!previewState) return null;
    const entry = previewState.entry;
    const player = entry.player;
    const importance = inferPlayerImportance({
      playerImportance: entry.kind === "catalog" ? entry.player.player_importance ?? null : null,
      bayernCategory: entry.kind === "catalog" ? entry.player.bayern_category ?? null : null,
      age: entry.kind === "catalog" ? entry.player.age : entry.player.age,
      transferValueMinEurM: entry.kind === "catalog" ? entry.player.transfer_value_min_eur_m ?? null : null,
      transferValueMaxEurM: entry.kind === "catalog" ? entry.player.transfer_value_max_eur_m ?? null : null,
      feeEurM: entry.kind === "signing" ? entry.player.fee ?? null : null,
      position: entry.kind === "catalog" ? entry.player.position : entry.player.position,
      rating: entry.kind === "signing" ? entry.player.rating ?? null : null,
    });
    const wageTier =
      importance === "core"
        ? "superstar"
        : importance === "starter"
          ? "elite"
          : importance === "rotation"
            ? "high"
            : importance === "development"
              ? "mid"
              : "low";
    const boardSaleStance =
      entry.kind === "catalog"
        ? entry.player.board_sale_stance ??
          (importance === "core"
            ? "retain"
            : importance === "starter"
              ? "sale_if_upgrade"
              : importance === "rotation"
                ? "open_to_sale"
                : importance === "development"
                  ? "open_to_sale"
                  : "must_sell")
        : importance === "core"
          ? "retain"
          : "open_to_sale";
    const sameBucketCount = positionBucketCount(entry, roster);
    const squadDepthBefore = sameBucketCount;
    const tacticalImportance = tacticalImportanceForEntry(entry);
    if (previewState.action === "sell") {
      const fee = entry.kind === "catalog" ? averageValue(entry.player.transfer_value_min_eur_m ?? null, entry.player.transfer_value_max_eur_m ?? null) : entry.player.fee ?? 20;
      const offers = createSaleOffers({
        playerId: entry.id,
        playerName: player.name,
        transferValueMinEurM: entry.kind === "catalog" ? entry.player.transfer_value_min_eur_m ?? null : Math.max(5, fee * 0.8),
        transferValueMaxEurM: entry.kind === "catalog" ? entry.player.transfer_value_max_eur_m ?? null : Math.max(8, fee * 1.2),
        playerImportance: importance,
        wageTier,
        boardSaleStance,
        age: player.age ?? null,
        contractYearsLeft: entry.kind === "catalog" ? entry.player.contract_years_left ?? null : null,
      });
      const impact = previewSaleImpact({
        playerId: entry.id,
        playerName: player.name,
        playerImportance: importance,
        wageTier,
        boardSaleStance,
        transferFeeEurM: offers[offers.recommended],
        replacementQuality: replacementQualityForEntry(entry, roster),
        squadDepthBefore,
        tacticalImportance,
        youthPathwayValue: youthPathwayForEntry(entry),
      });
      return {
        kind: "sell" as const,
        offers,
        impact,
        fee: offers[offers.recommended],
      };
    }
    const impact = previewLoanImpact({
      playerId: entry.id,
      playerName: player.name,
      playerImportance: importance,
      wageTier,
      age: player.age ?? null,
      pathwayValue: youthPathwayForEntry(entry),
      wageCoveragePercent: previewState.action === "loan" && entry.kind === "catalog" ? (importance === "development" ? 70 : importance === "rotation" ? 35 : 20) : 30,
      minutesPromise: importance === "development" || importance === "loan_candidate",
      squadDepthBefore,
      tacticalImportance,
    });
    return { kind: "loan" as const, impact };
  }, [previewState, roster]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Sell Players</CardTitle>
        <CardDescription>Select one or more players, then sell or loan them in bulk. Individual row actions remain available.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedCount ? (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-slate-700">{selectedCount} selected</p>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button size="sm" className="w-full sm:w-auto" variant="destructive" onClick={() => onBulkSell(selectedIds)}>
                Sell selected
              </Button>
              <Button size="sm" className="w-full sm:w-auto" variant="secondary" onClick={() => onBulkLoan(selectedIds)}>
                Loan selected
              </Button>
              <Button size="sm" className="w-full sm:w-auto" variant="outline" onClick={onClearSelection}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {roster.map((entry) => {
            const shirtNumber = entry.kind === "catalog" ? entry.player.shirt_number : null;
            const transferValue =
              entry.kind === "catalog"
                ? formatTransferValueRange(
                    entry.player.transfer_value_min_eur_m ?? null,
                    entry.player.transfer_value_max_eur_m ?? null,
                  )
                : "Fee already set";

            const checked = selectedIds.includes(entry.id);
            return (
              <div key={entry.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[auto_1fr_auto_auto] md:items-center">
                <label className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 p-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleSelected(entry.id)}
                    aria-label={`Select ${entry.kind === "catalog" ? entry.player.name : entry.player.name}`}
                  />
                </label>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{entry.kind === "catalog" ? entry.player.name : entry.player.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    Shirt {shirtNumber ?? "N/A"} | {entry.kind === "catalog" ? entry.player.position : "Signed"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {playerBadges(entry).slice(0, 3).map((badge) => (
                      <Badge key={badge.label} tone={badge.tone} className="normal-case tracking-normal">
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="muted">{shirtNumber ?? "N/A"}</Badge>
                  <Badge tone="gold">{transferValue}</Badge>
                  {sourceLabel(entry) ? <Badge tone={sourceTone(entry)}>{sourceLabel(entry)}</Badge> : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:justify-end">
                  {onInspectPlayer ? (
                    <Button size="sm" className="w-full md:w-auto" variant="outline" onClick={() => onInspectPlayer(entry)}>
                      Inspect
                    </Button>
                  ) : null}
                  <Button size="sm" className="w-full md:w-auto" variant="destructive" onClick={() => setPreviewState({ entry, action: "sell" })}>
                    Sell
                  </Button>
                  <Button size="sm" className="w-full md:w-auto" variant="secondary" onClick={() => setPreviewState({ entry, action: "loan" })}>
                    Loan
                  </Button>
                  <Button size="sm" className="w-full md:w-auto" variant="outline" onClick={() => onKeep(entry.id)}>
                    Keep
                  </Button>
                  <Button size="sm" className="w-full md:w-auto" variant="ghost" onClick={() => onMarkDevelopment(entry.id)}>
                    Develop
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      <DecisionImpactModal
        open={Boolean(previewState && preview)}
        title={
          previewState?.action === "sell"
            ? `Review sale: ${previewState.entry.player.name}`
            : previewState?.action === "loan"
              ? `Review loan: ${previewState.entry.player.name}`
              : ""
        }
        subtitle={
          previewState?.action === "sell" && preview?.kind === "sell"
            ? `Sale tiers: lowball EUR ${preview.offers.lowball}m | fair EUR ${preview.offers.fair}m | premium EUR ${preview.offers.premium}m`
            : previewState?.action === "loan"
              ? "Loan route: development minutes, wage coverage, and pathway impact"
              : ""
        }
        metaBadges={previewState ? previewBadges(previewState.entry) : undefined}
        contextLabel="Simulator model"
        preview={preview?.impact ?? null}
        actionLabel={previewState?.action === "sell" ? "Confirm sale" : "Confirm loan"}
        onCancel={() => setPreviewState(null)}
        onConfirm={async () => {
          if (!previewState) return;
          const entryId = previewState.entry.id;
          setPreviewState(null);
          if (previewState.action === "sell") {
            onSell(entryId);
          } else {
            onLoan(entryId);
          }
        }}
      />
    </Card>
  );
}

function averageValue(min?: number | null, max?: number | null) {
  if (min === null || min === undefined || max === null || max === undefined) return 0;
  return (min + max) / 2;
}

function positionBucketCount(entry: SimulationRosterEntry, roster: SimulationRosterEntry[]) {
  const bucket = positionBucketForEntry(entry);
  return roster.filter((item) => positionBucketForEntry(item) === bucket).length;
}

function positionBucketForEntry(entry: SimulationRosterEntry) {
  const position = entry.player.position ?? "";
  const upper = position.toUpperCase();
  if (upper.includes("GK")) return "GK";
  if (upper.includes("CB") || upper.includes("LB") || upper.includes("RB") || upper.includes("WB")) return "DEF";
  if (upper.includes("DM") || upper.includes("CM") || upper.includes("AM") || upper.includes("MID")) return "MID";
  return "ATT";
}

function tacticalImportanceForEntry(entry: SimulationRosterEntry) {
  const position = entry.player.position ?? "";
  const upper = position.toUpperCase();
  if (upper.includes("GK")) return 84;
  if (upper.includes("CB")) return 78;
  if (upper.includes("DM")) return 74;
  if (upper.includes("CM")) return 68;
  if (upper.includes("AM")) return 64;
  if (upper.includes("ST")) return 72;
  if (upper.includes("RW") || upper.includes("LW")) return 70;
  return 60;
}

function replacementQualityForEntry(entry: SimulationRosterEntry, roster: SimulationRosterEntry[]) {
  const count = positionBucketCount(entry, roster);
  if (count <= 2) return 42;
  if (count <= 4) return 56;
  if (count <= 6) return 66;
  return 74;
}

function youthPathwayForEntry(entry: SimulationRosterEntry) {
  if (entry.kind === "catalog") {
    if (entry.player.bayern_category === "youth") return 80;
    if (entry.player.bayern_category === "loan_return") return 58;
  }
  return entry.player.age && entry.player.age <= 22 ? 72 : 46;
}

function playerBadges(entry: SimulationRosterEntry): PlayerDetailBadge[] {
  return [
    { label: importanceLabel(entry), tone: importanceTone(entry) },
    sourceLabel(entry) ? { label: sourceLabel(entry), tone: sourceTone(entry) } : null,
    injuryLabel(entry) ? { label: injuryLabel(entry)!, tone: injuryTone(entry) } : null,
    { label: valueLabel(entry), tone: "muted" as const },
  ].filter(Boolean) as PlayerDetailBadge[];
}

function previewBadges(entry: SimulationRosterEntry): PlayerDetailBadge[] {
  return [
    { label: importanceLabel(entry), tone: importanceTone(entry) },
    sourceLabel(entry) ? { label: sourceLabel(entry), tone: sourceTone(entry) } : null,
    { label: "Simulator estimate", tone: "gold" as const },
  ].filter(Boolean) as PlayerDetailBadge[];
}

function importanceLabel(entry: SimulationRosterEntry) {
  const importance = entry.kind === "catalog" ? entry.player.player_importance : null;
  if (importance === "core") return "Core";
  if (importance === "starter") return "Starter";
  if (importance === "rotation") return "Rotation";
  if (importance === "development") return "Development";
  if (importance === "loan_candidate") return "Loan";
  if (importance === "sellable") return "Sellable";
  return entry.kind === "signing" ? "Signed" : "Squad";
}

function importanceTone(entry: SimulationRosterEntry) {
  const importance = entry.kind === "catalog" ? entry.player.player_importance : null;
  if (importance === "core" || importance === "starter") return "warning" as const;
  if (importance === "rotation" || importance === "loan_candidate") return "gold" as const;
  if (importance === "development") return "success" as const;
  return "muted" as const;
}

function sourceLabel(entry: SimulationRosterEntry) {
  if (entry.kind === "signing") return "Simulator estimate";
  if (entry.player.external_source === "manual") return "Curated fallback";
  return friendlySourceName(entry.player.external_source);
}

function sourceTone(entry: SimulationRosterEntry) {
  if (entry.kind === "signing") return "gold" as const;
  if (entry.player.external_source === "manual") return "warning" as const;
  return "success" as const;
}

function injuryLabel(entry: SimulationRosterEntry) {
  const risk = entry.kind === "catalog" ? entry.player.injury_risk ?? null : null;
  if (risk === null) return null;
  if (risk >= 65) return "Injury risk: high";
  if (risk >= 40) return "Injury risk: medium";
  return "Injury risk: low";
}

function injuryTone(entry: SimulationRosterEntry) {
  const risk = entry.kind === "catalog" ? entry.player.injury_risk ?? null : null;
  if (risk === null) return "muted" as const;
  if (risk >= 65) return "warning" as const;
  if (risk >= 40) return "gold" as const;
  return "success" as const;
}

function valueLabel(entry: SimulationRosterEntry) {
  return entry.kind === "catalog" ? "Curated value" : "Simulator estimate";
}

function friendlySourceName(source: string) {
  if (source === "openligadb") return "OpenLigaDB";
  if (source === "football-data") return "football-data.org";
  if (source === "thesportsdb") return "TheSportsDB";
  if (source === "wikidata") return "Wikidata";
  return source;
}
