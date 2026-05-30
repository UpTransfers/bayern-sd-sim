"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransferSearchResult } from "@/components/TransferSearch";

export function BoardConversationModal({
  transfer,
  onClose,
  onProceed,
  onConvince,
  lowConfidence = false,
}: {
  transfer: TransferSearchResult | null;
  onClose: () => void;
  onProceed: () => void;
  onConvince: () => void;
  lowConfidence?: boolean;
}) {
  if (!transfer) return null;

  const approval = transfer.approval;
  const stage = approval?.stage ?? "greenlight";
  const canProceed = !approval?.hardBlock;
  const title =
    stage === "greenlight"
      ? "Board approval"
      : stage === "negotiation"
      ? "Board negotiation"
      : stage === "board_review"
      ? "Board review"
      : "Board blocked";

  const stageTone = stage === "greenlight" ? "success" : stage === "negotiation" ? "gold" : stage === "board_review" ? "warning" : "muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
      <Card className="w-full max-w-2xl border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.3)]">
        <CardHeader className="border-b border-slate-200 bg-slate-50/90">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
              <CardTitle className="mt-1 text-2xl font-black text-slate-950">{transfer.name}</CardTitle>
              <p className="mt-1 text-sm text-slate-600">
                {transfer.club ?? "Unknown club"} | {transfer.position ?? "Unknown position"} | #{transfer.shirtNumber ?? "N/A"}
              </p>
            </div>
            <Badge tone={stageTone}>{approval?.decision ?? "Scout view"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <p className="text-sm leading-7 text-slate-700">
                {approval?.conversationSummary ??
                  "The board wants a direct explanation of the fee, role, wage structure, and whether this blocks a better internal option."}
              </p>
              {approval?.positionContext ? <p className="text-sm text-slate-600">{approval.positionContext}</p> : null}
              {lowConfidence ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Scouting confidence is low. The board can still discuss the deal, but the information quality is not strong.
                </div>
              ) : null}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Negotiation path</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{approval?.negotiationPath ?? "The board has no special conditions."}</p>
              </div>
              {approval?.openingOffer || approval?.counterOffer || approval?.wageCeiling || approval?.sellerStance ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {approval.openingOffer ? <InfoRow label="Opening offer" value={approval.openingOffer} /> : null}
                  {approval.counterOffer ? <InfoRow label="Counter offer" value={approval.counterOffer} /> : null}
                  {approval.wageCeiling ? <InfoRow label="Wage ceiling" value={approval.wageCeiling} /> : null}
                  {approval.sellerStance ? <InfoRow label="Seller stance" value={approval.sellerStance} /> : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <InfoRow label="Approval score" value={approval ? `${approval.total}/100` : "n/a"} />
              <InfoRow label="Stage" value={stage.replace("_", " ")} />
              <InfoRow label="Fee" value={`EUR ${transfer.fee}M`} />
              <InfoRow label="Wage note" value={approval?.wagePressureNote ?? "No wage note"} />
              {approval?.vetoReasons?.length ? (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Board concerns</p>
                  <div className="flex flex-wrap gap-2">
                    {approval.vetoReasons.map((reason) => (
                      <Badge key={reason} tone="warning">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {canProceed ? (
              <Button onClick={onProceed}>
                {stage === "greenlight" ? "Approve and sign" : stage === "negotiation" ? "Accept board terms" : "Proceed after review"}
              </Button>
            ) : (
              <Button onClick={onConvince}>
                Present sporting case
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}
