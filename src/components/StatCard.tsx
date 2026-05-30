import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sublabel,
  progress,
  tone = "default",
}: {
  label: string;
  value: string;
  sublabel?: string;
  progress?: number;
  tone?: "default" | "gold" | "success" | "warning";
}) {
  return (
    <Card className="bg-white/85">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
            <div className={cn(
              "mt-2 text-2xl font-black tracking-tight text-slate-950",
              tone === "gold" && "text-[#8a6d11]",
              tone === "success" && "text-emerald-700",
              tone === "warning" && "text-amber-700",
            )}>
              {value}
            </div>
            {sublabel ? <p className="mt-1 text-sm text-slate-600">{sublabel}</p> : null}
          </div>
          {typeof progress === "number" ? (
            <div className="w-24 pt-1">
              <Progress value={progress} />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
