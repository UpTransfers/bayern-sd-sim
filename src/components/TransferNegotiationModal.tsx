"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createTransferNegotiation, resolveNegotiationAction, inferPlayerImportance, type NegotiationAction, type NegotiationOffer } from "@/lib/football/negotiation";
import { previewSigningImpact } from "@/lib/football/decisionImpact";
import type { TransferSearchResult } from "@/components/TransferSearch";
import type { SimulationSummary, WageTier } from "@/lib/types";
import { clamp } from "@/lib/utils";

function mapWageConcernToTier(value?: TransferSearchResult["wageConcern"]): WageTier {
  if (value === "Low") return "low";
  if (value === "High") return "high";
  if (value === "Very High") return "superstar";
  return "mid";
}

function importanceFromNeed(need: number): ReturnType<typeof inferPlayerImportance> {
  if (need >= 82) return "starter";
  if (need >= 68) return "rotation";
  if (need >= 55) return "sellable";
  return "development";
}

function formatFee(value: number) {
  return `EUR ${Math.round(value)}m`;
}

function boardTone(stance: NegotiationOffer["boardStance"]) {
  if (stance === "approved") return "success" as const;
  if (stance === "approved_after_negotiation") return "gold" as const;
  if (stance === "needs_sales" || stance === "board_review") return "warning" as const;
  return "muted" as const;
}

type NegotiationPayload = {
  negotiation: NegotiationOffer;
  action: NegotiationAction;
  finalFeeEurM: number | null;
  status: "accepted" | "improved" | "walked_away" | "rejected";
  message: string;
  reasons: string[];
};

type NegotiationCommitResult = {
  success: boolean;
  message: string;
  reasons: string[];
};

export function TransferNegotiationModal({
  transfer,
  summary,
  open,
  onClose,
  onAccept,
  onWalkAway,
}: {
  transfer: TransferSearchResult | null;
  summary: SimulationSummary | null;
  open: boolean;
  onClose: () => void;
  onAccept: (payload: NegotiationPayload) => NegotiationCommitResult | Promise<NegotiationCommitResult>;
  onWalkAway: (payload: NegotiationPayload) => NegotiationCommitResult | Promise<NegotiationCommitResult>;
}) {
  const [resultMessage, setResultMessage] = useState<NegotiationCommitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const snapshot = useMemo(() => {
    if (!transfer) return null;
    const wageTier = mapWageConcernToTier(transfer.wageConcern);
    const importance = importanceFromNeed(transfer.need);
    const feeMin = Math.max(1, Math.round((transfer.fee * 0.88) * 2) / 2);
    const feeMax = Math.max(feeMin, Math.round((transfer.fee * 1.14) * 2) / 2);
    const baseSellerResistance = transfer.approval?.hardBlock
      ? 68
      : transfer.approval?.stage === "board_review"
        ? 58
        : transfer.lowConfidence
          ? 55
          : 40;
    return createTransferNegotiation({
      playerId: transfer.id,
      playerName: transfer.name,
      feeMinEurM: feeMin,
      feeMaxEurM: feeMax,
      wageTier,
      playerImportance: importance,
      tacticalFit: transfer.bayernFit ?? transfer.fit,
      squadNeed: transfer.need,
      sellerResistance: Math.max(30, baseSellerResistance - (transfer.need >= 75 ? 8 : 0)),
      contractYears: transfer.contract ? contractYearsLeft(transfer.contract) : 3,
      injuryRisk: transfer.lowConfidence ? 34 : 22,
    });
  }, [transfer]);

  const preview = useMemo(() => {
    if (!transfer) return null;
    return previewSigningImpact({
      playerId: transfer.id,
      playerName: transfer.name,
      feeEurM: snapshot?.openingFeeEurM ?? transfer.fee,
      wageDemandTier: mapWageConcernToTier(transfer.wageConcern),
      targetImportance: importanceFromNeed(transfer.need),
      tacticalFit: transfer.bayernFit ? transfer.bayernFit * 10 : transfer.fit,
      squadNeed: transfer.need,
      injuryRisk: transfer.lowConfidence ? 34 : 22,
      contractYears: transfer.contract ? contractYearsLeft(transfer.contract) : 3,
      blocksYouthPathway: transfer.need < 75,
      replacementQuality: summary?.activeRoster.length ? 58 : 50,
      sellerResistance: snapshot?.sellerResistance ?? 50,
    });
  }, [snapshot?.openingFeeEurM, snapshot?.sellerResistance, summary?.activeRoster.length, transfer]);

  if (!open || !transfer || !snapshot || !preview) return null;

  async function handleAction(action: NegotiationAction) {
    if (!snapshot) return;
    setSubmitting(true);
    setResultMessage(null);
    const resolved = resolveNegotiationAction({
      action,
      offer: snapshot,
      improvedFeeEurM: snapshot.openingFeeEurM,
    });
    try {
      const payload = {
        negotiation: snapshot,
        action,
        finalFeeEurM: resolved.finalFeeEurM,
        status: resolved.status,
        message: resolved.message,
        reasons: resolved.reasons,
      } satisfies NegotiationPayload;
      const result = action === "accept" ? await onAccept(payload) : await onWalkAway(payload);
      setResultMessage(result);
      if (result.success) onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-8">
      <Card className="max-h-[calc(100svh-2rem)] w-full max-w-3xl overflow-y-auto border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.3)]">
        <CardHeader className="border-b border-slate-200 bg-slate-50/90">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Transfer talks</p>
              <CardTitle className="mt-1 break-words text-xl font-black text-slate-950 sm:text-2xl">{transfer.name}</CardTitle>
              <p className="mt-1 text-sm text-slate-600">
                {transfer.club ?? "Unknown club"} | {transfer.position ?? "Unknown position"} | #{transfer.shirtNumber ?? "N/A"}
              </p>
            </div>
            <Badge tone={boardTone(snapshot.boardStance)}>{snapshot.boardStance.replace(/_/g, " ")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-5">
          {resultMessage ? (
            <div className={`rounded-2xl border px-4 py-3 ${resultMessage.success ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-sm font-semibold ${resultMessage.success ? "text-emerald-900" : "text-red-900"}`}>{resultMessage.message}</p>
              {resultMessage.reasons.length ? (
                <ul className={`mt-2 space-y-1 text-sm ${resultMessage.success ? "text-emerald-800" : "text-red-800"}`}>
                  {resultMessage.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Opening offer" value={formatFee(snapshot.openingFeeEurM)} />
            <InfoCard label="Seller counter" value={formatFee(snapshot.sellerCounterEurM)} />
            <InfoCard label="Wage demand" value={snapshot.wageDemandTier} />
            <InfoCard label="Board stance" value={snapshot.boardStance.replace(/_/g, " ")} />
            <InfoCard label="Seller resistance" value={`${snapshot.sellerResistance}/100`} />
            <InfoCard label="Impact" value={preview.severity} />
            <InfoCard label="Need" value={`${transfer.need}/100`} />
          </div>

          <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reasons</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {snapshot.reasons.map((reason) => (
                  <li key={reason} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Decision preview</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {preview.reasons.slice(0, 4).map((reason) => (
                  <div key={reason} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {reason}
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {preview.reasons[0] ?? "This move can be committed if the final fee and wage structure stay disciplined."}
              </div>
            </div>
          </div>

          <div className="grid gap-2 pt-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button className="w-full sm:w-auto" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => void handleAction("walk_away")} disabled={submitting}>
              Walk away
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => void handleAction("accept")} disabled={submitting}>
              {submitting ? "Checking" : "Accept"}
            </Button>
          </div>
        </CardContent>
      </Card>
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

function contractYearsLeft(contract?: string | null) {
  const match = contract?.match(/20(\d{2})/);
  if (!match) return 3;
  const year = Number(match[1]);
  if (!Number.isFinite(year)) return 3;
  return clamp(2029 - Number(`20${match[1]}`), 1, 6);
}
