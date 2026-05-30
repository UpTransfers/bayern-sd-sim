import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTransferValueRange } from "@/lib/utils";
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
}) {
  const selectedCount = selectedIds.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sell Players</CardTitle>
        <CardDescription>Select one or more players, then sell or loan them in bulk. Individual row actions remain available.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedCount ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">{selectedCount} selected</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" onClick={() => onBulkSell(selectedIds)}>
                Sell selected
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onBulkLoan(selectedIds)}>
                Loan selected
              </Button>
              <Button size="sm" variant="outline" onClick={onClearSelection}>
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
              <div key={entry.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[auto_1fr_auto_auto] md:items-center">
                <label className="flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 p-2">
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
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="muted">{shirtNumber ?? "N/A"}</Badge>
                  <Badge tone="gold">{transferValue}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                  <Button size="sm" variant="destructive" onClick={() => onSell(entry.id)}>
                    Sell
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onLoan(entry.id)}>
                    Loan
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onKeep(entry.id)}>
                    Keep
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onMarkDevelopment(entry.id)}>
                    Develop
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
