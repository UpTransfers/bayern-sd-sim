import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DecisionImpactPreview } from "@/lib/football/decisionImpact";

export function DecisionImpactModal({
  title,
  subtitle,
  preview,
  metaBadges,
  contextLabel,
  open,
  actionLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  preview: DecisionImpactPreview | null;
  metaBadges?: Array<{ label: string; tone: "success" | "warning" | "gold" | "muted" }>;
  contextLabel?: string;
  open: boolean;
  actionLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || !preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-8">
      <Card className="max-h-[calc(100svh-2rem)] w-full max-w-3xl overflow-y-auto border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.3)]">
        <CardHeader className="border-b border-slate-200 bg-slate-50/90">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{subtitle}</p>
              <CardTitle className="mt-1 break-words text-xl font-black text-slate-950 sm:text-2xl">{title}</CardTitle>
              {metaBadges?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {metaBadges.map((badge) => (
                    <Badge key={badge.label} tone={badge.tone}>
                      {badge.label}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {contextLabel ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="muted">{contextLabel}</Badge>
                </div>
              ) : null}
            </div>
            <Badge tone={toneForSeverity(preview.severity)}>{preview.severity}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-3 min-[430px]:grid-cols-2 xl:grid-cols-4">
            <Metric label="Budget" value={delta(preview.budgetDelta, "m")} />
            <Metric label="Wages" value={delta(preview.wageDelta, "m")} />
            <Metric label="Depth" value={delta(preview.squadDepthDelta)} />
            <Metric label="Board" value={delta(preview.boardConfidenceDelta)} />
            <Metric label="Fans" value={delta(preview.fanConfidenceDelta)} />
            <Metric label="Media" value={delta(preview.mediaPressureDelta)} />
            <Metric label="Tactical" value={delta(preview.tacticalFitDelta)} />
            <Metric label="Pathway" value={delta(preview.youthPathwayDelta)} />
          </div>

          <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reasons</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {preview.reasons.map((reason) => (
                  <li key={reason} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <Metric label="Replacement risk" value={`${Math.round(preview.replacementRisk)}/100`} />
              <p className="text-sm text-slate-600">
                {riskSummary(preview.replacementRisk)}
              </p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {summaryForSeverity(preview.severity)}
              </div>
            </div>
          </div>

          <div className="grid gap-2 pt-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button className="w-full sm:w-auto" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={onConfirm}>
              {actionLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function toneForSeverity(severity: DecisionImpactPreview["severity"]) {
  if (severity === "positive") return "success";
  if (severity === "warning") return "gold";
  if (severity === "danger") return "warning";
  return "muted";
}

function delta(value: number, suffix = "") {
  const signed = value > 0 ? `+${value}` : `${value}`;
  return suffix ? `${signed}${suffix}` : signed;
}

function riskSummary(value: number) {
  if (value <= 20) return "Low replacement risk. The squad can absorb this decision.";
  if (value <= 45) return "Medium replacement risk. A backup plan still matters.";
  if (value <= 70) return "High replacement risk. This needs a clear follow-up option.";
  return "Severe replacement risk. The current plan looks fragile.";
}

function summaryForSeverity(severity: DecisionImpactPreview["severity"]) {
  if (severity === "positive") return "This is generally a constructive decision for the squad and the board.";
  if (severity === "neutral") return "This is a manageable decision, but the details still matter.";
  if (severity === "warning") return "There is some downside here, so the decision needs care.";
  return "This is a high-risk decision and should only go through with a strong reason.";
}
