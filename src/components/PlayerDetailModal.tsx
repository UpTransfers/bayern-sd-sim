"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PlayerDetailBadgeTone = "success" | "warning" | "gold" | "muted";

export type PlayerDetailBadge = {
  label: string;
  tone: PlayerDetailBadgeTone;
};

export type PlayerDetailView = {
  id: string;
  name: string;
  position: string | null;
  age: number | null;
  shirtNumber: string | number | null;
  categoryLabel: string;
  valueLabel: string;
  sourceLabel: string;
  sourceTone: PlayerDetailBadgeTone;
  importanceLabel: string | null;
  wageTierLabel: string | null;
  dressingRoomRoleLabel: string | null;
  tacticalRoleLabel: string | null;
  boardSaleStanceLabel: string | null;
  injuryRisk: number | null;
  leadershipValue: number | null;
  academyPathwayValue: number | null;
  contractYearsLeft: number | null;
  minutesExpectation: string | null;
  sourceNote: string | null;
  notes: string[];
  badges?: PlayerDetailBadge[];
};

export function PlayerDetailModal({
  open,
  player,
  onClose,
  onSell,
  onLoan,
  onOpenNegotiation,
  onCompare,
}: {
  open: boolean;
  player: PlayerDetailView | null;
  onClose: () => void;
  onSell?: () => void;
  onLoan?: () => void;
  onOpenNegotiation?: () => void;
  onCompare?: () => void;
}) {
  if (!open || !player) return null;

  const actionable = Boolean(onSell || onLoan || onOpenNegotiation || onCompare);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-4 backdrop-blur-sm sm:py-8">
      <Card className="max-h-[calc(100svh-2rem)] w-full max-w-3xl overflow-y-auto border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.32)]">
        <CardHeader className="border-b border-slate-200 bg-slate-50/90">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{player.categoryLabel}</p>
              <CardTitle className="mt-1 truncate text-2xl font-black text-slate-950">{player.name}</CardTitle>
              <p className="mt-1 text-sm text-slate-600">
                {player.position ?? "Unknown position"}
                {player.age !== null ? ` | Age ${player.age}` : ""}
                {player.shirtNumber !== null && player.shirtNumber !== undefined ? ` | #${player.shirtNumber}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Badge tone={player.sourceTone}>{player.sourceLabel}</Badge>
              {player.badges?.slice(0, 3).map((badge) => (
                <Badge key={badge.label} tone={badge.tone}>
                  {badge.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Value" value={player.valueLabel} />
            <InfoCard label="Importance" value={player.importanceLabel ?? "Unknown"} />
            <InfoCard label="Estimated wage tier" value={player.wageTierLabel ?? "Unknown"} />
            <InfoCard label="Role" value={player.dressingRoomRoleLabel ?? "Unknown"} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Football role">
              <DetailLine label="Tactical role" value={player.tacticalRoleLabel ?? "Unknown"} />
              <DetailLine label="Board stance" value={player.boardSaleStanceLabel ?? "Unknown"} />
              <DetailLine label="Minutes" value={player.minutesExpectation ?? "Unknown"} />
              <DetailLine label="Contract" value={player.contractYearsLeft !== null ? `${player.contractYearsLeft} years left` : "Unknown"} />
            </Panel>
            <Panel title="Contract / finance">
              <DetailLine label="Source" value={player.sourceLabel} />
              <DetailLine label="Source note" value={player.sourceNote ?? "No source note."} />
              <DetailLine label="Leadership" value={player.leadershipValue !== null ? `${Math.round(player.leadershipValue)}/100` : "Unknown"} />
              <DetailLine label="Value note" value={player.valueLabel} />
            </Panel>
            <Panel title="Squad status">
              <DetailLine label="Age" value={player.age !== null ? String(player.age) : "Unknown"} />
              <DetailLine
                label="Shirt number"
                value={player.shirtNumber !== null && player.shirtNumber !== undefined ? String(player.shirtNumber) : "N/A"}
              />
              <DetailLine label="Dressing room" value={player.dressingRoomRoleLabel ?? "Unknown"} />
            </Panel>
            <Panel title="Risk / pathway">
              <DetailLine label="Injury risk" value={player.injuryRisk !== null ? `${Math.round(player.injuryRisk)}/100` : "Unknown"} />
              <DetailLine label="Pathway" value={player.academyPathwayValue !== null ? `${Math.round(player.academyPathwayValue)}/100` : "Unknown"} />
              <DetailLine label="Notes" value={player.notes[0] ?? "No extra note."} />
            </Panel>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Data source</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={player.sourceTone}>{player.sourceLabel}</Badge>
              {player.badges?.slice(3).map((badge) => (
                <Badge key={badge.label} tone={badge.tone}>
                  {badge.label}
                </Badge>
              ))}
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {player.notes.slice(0, 3).map((note) => (
                <li key={note} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  {note}
                </li>
              ))}
            </ul>
          </div>

          {actionable ? (
            <div className="grid gap-2 pt-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button className="w-full sm:w-auto" variant="outline" onClick={onClose}>
                Close
              </Button>
              {onCompare ? (
                <Button className="w-full sm:w-auto" variant="ghost" onClick={onCompare}>
                  Compare
                </Button>
              ) : null}
              {onLoan ? (
                <Button className="w-full sm:w-auto" variant="secondary" onClick={onLoan}>
                  Loan
                </Button>
              ) : null}
              {onSell ? (
                <Button className="w-full sm:w-auto" variant="destructive" onClick={onSell}>
                  Sell
                </Button>
              ) : null}
              {onOpenNegotiation ? (
                <Button className="w-full sm:w-auto" onClick={onOpenNegotiation}>
                  Open talks
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex justify-end pt-2">
              <Button className="w-full sm:w-auto" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
