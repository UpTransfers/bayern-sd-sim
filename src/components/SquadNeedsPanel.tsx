import { AlertCircle, CheckCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function urgencyMeta(value: number): {
  label: string;
  tone: "success" | "gold" | "warning" | "muted";
  icon: React.ReactNode;
  description: string;
} {
  if (value >= 75) {
    return {
      label: "Critical",
      tone: "warning",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      description: "Immediate signing required to avoid depth crisis.",
    };
  }
  if (value >= 50) {
    return {
      label: "High need",
      tone: "gold",
      icon: <Info className="h-3.5 w-3.5" />,
      description: "Limited cover, worth targeting before the window closes.",
    };
  }
  if (value >= 25) {
    return {
      label: "Medium",
      tone: "muted",
      icon: <Info className="h-3.5 w-3.5" />,
      description: "Adequate for now, but quality upgrades are available.",
    };
  }
  return {
    label: "Covered",
    tone: "success",
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    description: "Good depth. No immediate action needed.",
  };
}

function positionIcon(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("goalkeeper") || lower.includes("gk")) return "GK";
  if (lower.includes("centre-back") || lower.includes("cb") || lower.includes("central def")) return "CB";
  if (lower.includes("full-back") || lower.includes("lb") || lower.includes("rb")) return "FB";
  if (lower.includes("defensive mid") || lower.includes("dm")) return "DM";
  if (lower.includes("central mid") || lower.includes("cm")) return "CM";
  if (lower.includes("winger") || lower.includes("lw") || lower.includes("rw")) return "W";
  if (lower.includes("striker") || lower.includes("forward") || lower.includes("st")) return "ST";
  if (lower.includes("attacker") || lower.includes("am")) return "AM";
  return label.slice(0, 2).toUpperCase();
}

function NeedRow({ label, value }: { label: string; value: number }) {
  const { tone, icon, description, label: urgencyLabel } = urgencyMeta(value);
  const abbr = positionIcon(label);
  const barColor =
    value >= 75
      ? "bg-gradient-to-r from-red-500 to-rose-400"
      : value >= 50
        ? "bg-gradient-to-r from-amber-400 to-yellow-300"
        : value >= 25
          ? "bg-gradient-to-r from-slate-400 to-slate-300"
          : "bg-gradient-to-r from-emerald-500 to-emerald-400";

  return (
    <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white/90 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-10 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-600">
            {abbr}
          </div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
        </div>
        <Badge tone={tone} className="flex items-center gap-1">
          {icon}
          {urgencyLabel}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">{description}</span>
          <span className="font-semibold text-slate-700">{value}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`} style={{ width: `${value}%` }} />
        </div>
      </div>
    </div>
  );
}

export function SquadNeedsPanel({ needs }: { needs: Array<{ label: string; value: number }> }) {
  const critical = needs.filter((item) => item.value >= 75);
  const sorted = [...needs].sort((a, b) => b.value - a.value);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Squad Needs</CardTitle>
            <CardDescription>Position-by-position depth pressure. Red means sign now.</CardDescription>
          </div>
          {critical.length > 0 ? (
            <Badge tone="warning" className="flex items-center gap-1 shrink-0">
              <AlertCircle className="h-3.5 w-3.5" />
              {critical.length} critical
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.length ? (
          <>
            {sorted.map((need) => (
              <NeedRow key={need.label} label={need.label} value={need.value} />
            ))}
            <div className="flex flex-wrap gap-3 pt-1 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-4 rounded-full bg-red-500" /> Critical &gt;=75
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-4 rounded-full bg-amber-400" /> High &gt;=50
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-4 rounded-full bg-emerald-500" /> Covered &lt;25
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">No squad needs detected. Sign players to see balance analysis.</p>
        )}
      </CardContent>
    </Card>
  );
}
