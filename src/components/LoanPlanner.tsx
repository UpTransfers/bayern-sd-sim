import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlayerRecord } from "@/lib/types";
import { formatTransferValueRange } from "@/lib/utils";
import { DecisionImpactModal } from "@/components/DecisionImpactModal";
import { createSaleOffers, inferPlayerImportance } from "@/lib/football/negotiation";
import { previewLoanImpact, previewSaleImpact } from "@/lib/football/decisionImpact";
import type { PlayerDetailBadge } from "@/components/PlayerDetailModal";

export function LoanPlanner({
  loanReturns,
  youthProspects,
  onLoan,
  onKeep,
  onSell,
  onMarkDevelopment,
  selectedIds,
  onToggleSelected,
  onBulkLoan,
  onBulkKeep,
  onBulkSell,
  onBulkDevelopment,
  onClearSelection,
  onInspectPlayer,
}: {
  loanReturns: PlayerRecord[];
  youthProspects: PlayerRecord[];
  onLoan: (id: string) => void;
  onKeep: (id: string) => void;
  onSell: (id: string) => void;
  onMarkDevelopment: (id: string) => void;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onBulkLoan: (ids: string[]) => void;
  onBulkKeep: (ids: string[]) => void;
  onBulkSell: (ids: string[]) => void;
  onBulkDevelopment: (ids: string[]) => void;
  onClearSelection: () => void;
  onInspectPlayer?: (player: PlayerRecord) => void;
}) {
  const selectedCount = selectedIds.length;
  const [previewState, setPreviewState] = useState<null | { player: PlayerRecord; action: "sell" | "loan" }>(null);

  const preview = useMemo(() => {
    if (!previewState) return null;
    const player = previewState.player;
    const importance = inferPlayerImportance({
      playerImportance: player.player_importance ?? null,
      bayernCategory: player.bayern_category ?? null,
      age: player.age,
      transferValueMinEurM: player.transfer_value_min_eur_m ?? null,
      transferValueMaxEurM: player.transfer_value_max_eur_m ?? null,
      position: player.position,
    });
    const wageTier =
      player.wage_tier ??
      (importance === "core"
        ? "superstar"
        : importance === "starter"
          ? "elite"
          : importance === "rotation"
            ? "high"
            : importance === "development"
              ? "mid"
              : "low");
    const boardSaleStance =
      player.board_sale_stance ??
      (importance === "core"
        ? "retain"
        : importance === "starter"
          ? "sale_if_upgrade"
          : importance === "rotation"
            ? "open_to_sale"
            : importance === "development"
              ? "open_to_sale"
              : "must_sell");
    const sameBucketCount = bucketCount(player.position, [...loanReturns, ...youthProspects]);
    const squadDepthBefore = sameBucketCount;
    const tacticalImportance = tacticalImportanceForPlayer(player);

    if (previewState.action === "sell") {
      const offers = createSaleOffers({
        playerId: player.id,
        playerName: player.name,
        transferValueMinEurM: player.transfer_value_min_eur_m ?? null,
        transferValueMaxEurM: player.transfer_value_max_eur_m ?? null,
        playerImportance: importance,
        wageTier,
        boardSaleStance,
        age: player.age,
        contractYearsLeft: player.contract_years_left ?? null,
      });
      const impact = previewSaleImpact({
        playerId: player.id,
        playerName: player.name,
        playerImportance: importance,
        wageTier,
        boardSaleStance,
        transferFeeEurM: offers[offers.recommended],
        replacementQuality: replacementQualityForPlayer(player, [...loanReturns, ...youthProspects]),
        squadDepthBefore,
        tacticalImportance,
        youthPathwayValue: youthPathwayForPlayer(player),
      });
      return { kind: "sell" as const, offers, impact };
    }

    const impact = previewLoanImpact({
      playerId: player.id,
      playerName: player.name,
      playerImportance: importance,
      wageTier,
      age: player.age,
      pathwayValue: youthPathwayForPlayer(player),
      wageCoveragePercent: importance === "development" ? 70 : importance === "rotation" ? 35 : 25,
      minutesPromise: importance === "development" || importance === "loan_candidate",
      squadDepthBefore,
      tacticalImportance,
    });

    return { kind: "loan" as const, impact };
  }, [previewState, loanReturns, youthProspects]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Loan and Development</CardTitle>
        <CardDescription>Loan returns and youth prospects are shown separately from the first-team squad.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
              <Button size="sm" className="w-full sm:w-auto" variant="outline" onClick={() => onBulkKeep(selectedIds)}>
                Keep selected
              </Button>
              <Button size="sm" className="w-full sm:w-auto" variant="ghost" onClick={() => onBulkDevelopment(selectedIds)}>
                Develop selected
              </Button>
              <Button size="sm" className="w-full sm:w-auto" variant="outline" onClick={onClearSelection}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}
        <Block
          title="Loan returns"
          items={loanReturns}
          onLoan={(player) => setPreviewState({ player, action: "loan" })}
          onKeep={onKeep}
          onSell={(player) => setPreviewState({ player, action: "sell" })}
          onMarkDevelopment={onMarkDevelopment}
          onInspectPlayer={onInspectPlayer}
          keepLabel="Keep in first team"
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
        />
        <Block
          title="Youth prospects"
          items={youthProspects}
          onLoan={(player) => setPreviewState({ player, action: "loan" })}
          onKeep={onKeep}
          onSell={(player) => setPreviewState({ player, action: "sell" })}
          onMarkDevelopment={onMarkDevelopment}
          onInspectPlayer={onInspectPlayer}
          keepLabel="Promote to squad"
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
        />
      </CardContent>
      <DecisionImpactModal
        open={Boolean(previewState && preview)}
        title={
          previewState?.action === "sell"
            ? `Review sale: ${previewState.player.name}`
            : `Review loan: ${previewState?.player.name ?? ""}`
        }
        subtitle={
          previewState?.action === "sell" && preview?.kind === "sell"
            ? `Sale tiers: lowball EUR ${preview.offers.lowball}m | fair EUR ${preview.offers.fair}m | premium EUR ${preview.offers.premium}m`
            : "Loan route: wage coverage, pathway value, and minutes promise"
        }
        metaBadges={previewState ? previewBadges(previewState.player) : undefined}
        contextLabel="Simulator model"
        preview={preview?.impact ?? null}
        actionLabel={previewState?.action === "sell" ? "Confirm sale" : "Confirm loan"}
        onCancel={() => setPreviewState(null)}
        onConfirm={async () => {
          if (!previewState) return;
          const playerId = previewState.player.id;
          setPreviewState(null);
          if (previewState.action === "sell") {
            onSell(playerId);
          } else {
            onLoan(playerId);
          }
        }}
      />
    </Card>
  );
}

function Block({
  title,
  items,
  onLoan,
  onKeep,
  onSell,
  onMarkDevelopment,
  onInspectPlayer,
  keepLabel,
  selectedIds,
  onToggleSelected,
}: {
  title: string;
  items: PlayerRecord[];
  onLoan: (player: PlayerRecord) => void;
  onKeep: (id: string) => void;
  onSell: (player: PlayerRecord) => void;
  onMarkDevelopment: (id: string) => void;
  onInspectPlayer?: (player: PlayerRecord) => void;
  keepLabel: string;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
        <Badge tone="muted">{items.length}</Badge>
      </div>
      <div className="space-y-3">
        {items.length ? (
          items.map((player) => {
            const transferValue = formatTransferValueRange(player.transfer_value_min_eur_m ?? null, player.transfer_value_max_eur_m ?? null);
            const checked = selectedIds.includes(player.id);
            return (
              <div
                key={player.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[auto_1fr_auto_auto] md:items-center"
              >
                <label className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 p-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleSelected(player.id)}
                    aria-label={`Select ${player.name}`}
                  />
                </label>
                <div>
                  <p className="font-semibold text-slate-950">{player.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    Shirt {player.shirt_number ?? "N/A"} | {player.position ?? "Unknown"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {playerBadges(player).slice(0, 3).map((badge) => (
                      <Badge key={badge.label} tone={badge.tone} className="normal-case tracking-normal">
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="gold">{transferValue}</Badge>
                  <Badge tone={sourceTone(player)}>{sourceLabel(player)}</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:justify-end">
                  {onInspectPlayer ? (
                    <Button size="sm" className="w-full md:w-auto" variant="outline" onClick={() => onInspectPlayer(player)}>
                      Inspect
                    </Button>
                  ) : null}
                  <Button size="sm" className="w-full md:w-auto" variant="secondary" onClick={() => onKeep(player.id)}>
                    {keepLabel}
                  </Button>
                  <Button size="sm" className="w-full md:w-auto" variant="outline" onClick={() => onLoan(player)}>
                    Loan again
                  </Button>
                  <Button size="sm" className="w-full md:w-auto" variant="ghost" onClick={() => onMarkDevelopment(player.id)}>
                    Develop
                  </Button>
                  <Button size="sm" className="w-full md:w-auto" variant="destructive" onClick={() => onSell(player)}>
                    Sell
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-slate-600">No entries.</p>
        )}
      </div>
    </div>
  );
}

function bucketCount(position: string | null | undefined, items: PlayerRecord[]) {
  const bucket = positionBucket(position);
  return items.filter((item) => positionBucket(item.position) === bucket).length;
}

function positionBucket(position: string | null | undefined) {
  const upper = (position ?? "").toUpperCase();
  if (upper.includes("GK")) return "GK";
  if (upper.includes("CB") || upper.includes("LB") || upper.includes("RB") || upper.includes("WB")) return "DEF";
  if (upper.includes("DM") || upper.includes("CM") || upper.includes("AM") || upper.includes("MID")) return "MID";
  return "ATT";
}

function tacticalImportanceForPlayer(player: PlayerRecord) {
  const upper = (player.position ?? "").toUpperCase();
  if (upper.includes("GK")) return 84;
  if (upper.includes("CB")) return 78;
  if (upper.includes("DM")) return 74;
  if (upper.includes("CM")) return 68;
  if (upper.includes("AM")) return 64;
  if (upper.includes("ST")) return 72;
  if (upper.includes("RW") || upper.includes("LW")) return 70;
  return 60;
}

function replacementQualityForPlayer(player: PlayerRecord, items: PlayerRecord[]) {
  const count = bucketCount(player.position, items);
  if (count <= 1) return 38;
  if (count <= 3) return 52;
  if (count <= 5) return 64;
  return 72;
}

function youthPathwayForPlayer(player: PlayerRecord) {
  if (player.bayern_category === "youth") return 80;
  if (player.bayern_category === "loan_return") return 58;
  return player.age && player.age <= 22 ? 70 : 44;
}

function playerBadges(player: PlayerRecord): PlayerDetailBadge[] {
  return [
    { label: importanceLabel(player), tone: importanceTone(player) },
    { label: sourceLabel(player), tone: sourceTone(player) },
    injuryLabel(player) ? { label: injuryLabel(player)!, tone: injuryTone(player) } : null,
    { label: "Curated value", tone: "muted" as const },
  ].filter(Boolean) as PlayerDetailBadge[];
}

function previewBadges(player: PlayerRecord): PlayerDetailBadge[] {
  return [
    { label: importanceLabel(player), tone: importanceTone(player) },
    { label: sourceLabel(player), tone: sourceTone(player) },
    { label: "Simulator estimate", tone: "gold" as const },
  ];
}

function importanceLabel(player: PlayerRecord) {
  const importance = inferPlayerImportance({
    playerImportance: player.player_importance ?? null,
    bayernCategory: player.bayern_category ?? null,
    age: player.age,
    transferValueMinEurM: player.transfer_value_min_eur_m ?? null,
    transferValueMaxEurM: player.transfer_value_max_eur_m ?? null,
    position: player.position,
  });
  if (importance === "core") return "Core";
  if (importance === "starter") return "Starter";
  if (importance === "rotation") return "Rotation";
  if (importance === "development") return "Development";
  if (importance === "loan_candidate") return "Loan";
  if (importance === "sellable") return "Sellable";
  return "Squad";
}

function importanceTone(player: PlayerRecord) {
  const importance = inferPlayerImportance({
    playerImportance: player.player_importance ?? null,
    bayernCategory: player.bayern_category ?? null,
    age: player.age,
    transferValueMinEurM: player.transfer_value_min_eur_m ?? null,
    transferValueMaxEurM: player.transfer_value_max_eur_m ?? null,
    position: player.position,
  });
  if (importance === "core" || importance === "starter") return "warning" as const;
  if (importance === "rotation" || importance === "loan_candidate") return "gold" as const;
  if (importance === "development") return "success" as const;
  return "muted" as const;
}

function sourceLabel(player: PlayerRecord) {
  if (player.external_source === "manual") return "Curated fallback";
  return friendlySourceName(player.external_source);
}

function sourceTone(player: PlayerRecord) {
  if (player.external_source === "manual") return "warning" as const;
  return "success" as const;
}

function injuryLabel(player: PlayerRecord) {
  const risk = player.injury_risk ?? null;
  if (risk === null) return null;
  if (risk >= 65) return "Injury risk: high";
  if (risk >= 40) return "Injury risk: medium";
  return "Injury risk: low";
}

function injuryTone(player: PlayerRecord) {
  const risk = player.injury_risk ?? null;
  if (risk === null) return "muted" as const;
  if (risk >= 65) return "warning" as const;
  if (risk >= 40) return "gold" as const;
  return "success" as const;
}

function friendlySourceName(source: string) {
  if (source === "openligadb") return "OpenLigaDB";
  if (source === "football-data") return "football-data.org";
  if (source === "thesportsdb") return "TheSportsDB";
  if (source === "wikidata") return "Wikidata";
  return source;
}
