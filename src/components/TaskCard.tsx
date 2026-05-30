import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function TaskCard({
  number,
  title,
  description,
  icon,
  status,
  progress,
  onClick,
  active = false,
}: {
  number: string;
  title: string;
  description: string;
  icon: ReactNode;
  status: "Pending" | "In Progress" | "Complete";
  progress: number;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Card
      className={cn(
        "h-full overflow-hidden border-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(14,18,35,0.12)]",
        active && "ring-2 ring-[#d4af37]/45",
      )}
    >
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{number}</span>
          <div className="text-2xl">{icon}</div>
        </div>
        <h3 className="mt-4 text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-2 min-h-16 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-auto space-y-3">
          <Badge tone={status === "Complete" ? "success" : status === "In Progress" ? "gold" : "warning"}>
            {status}
          </Badge>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-[#b80d19] via-[#e11d48] to-[#d4af37]"
              style={{ width: `${progress}%` }}
            />
          </div>
          {onClick ? (
            <Button variant={status === "Complete" ? "secondary" : "default"} size="sm" className="w-full" onClick={onClick}>
              Open Task
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
