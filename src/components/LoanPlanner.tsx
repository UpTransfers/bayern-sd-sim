import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlayerRecord } from "@/lib/types";
import { formatTransferValueRange } from "@/lib/utils";

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
}) {
  const selectedCount = selectedIds.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Loan and Development</CardTitle>
        <CardDescription>Loan returns and youth prospects are shown separately from the first-team squad.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
              <Button size="sm" variant="outline" onClick={() => onBulkKeep(selectedIds)}>
                Keep selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onBulkDevelopment(selectedIds)}>
                Develop selected
              </Button>
              <Button size="sm" variant="outline" onClick={onClearSelection}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}
        <Block
          title="Loan returns"
          items={loanReturns}
          onLoan={onLoan}
          onKeep={onKeep}
          onSell={onSell}
          onMarkDevelopment={onMarkDevelopment}
          keepLabel="Keep in first team"
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
        />
        <Block
          title="Youth prospects"
          items={youthProspects}
          onLoan={onLoan}
          onKeep={onKeep}
          onSell={onSell}
          onMarkDevelopment={onMarkDevelopment}
          keepLabel="Promote to squad"
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
        />
      </CardContent>
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
  keepLabel,
  selectedIds,
  onToggleSelected,
}: {
  title: string;
  items: PlayerRecord[];
  onLoan: (id: string) => void;
  onKeep: (id: string) => void;
  onSell: (id: string) => void;
  onMarkDevelopment: (id: string) => void;
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
                className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[auto_1fr_auto_auto] md:items-center"
              >
                <label className="flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 p-2">
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
                </div>
                <Badge tone="gold">{transferValue}</Badge>
                <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                  <Button size="sm" variant="secondary" onClick={() => onKeep(player.id)}>
                    {keepLabel}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onLoan(player.id)}>
                    Loan again
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onMarkDevelopment(player.id)}>
                    Develop
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => onSell(player.id)}>
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
