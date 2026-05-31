import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, WifiOff, Database } from "lucide-react";
import type { DataSourceRecord } from "@/lib/types";

export function DataHealthBadge({
  sources,
  compact = false,
}: {
  sources: DataSourceRecord[];
  compact?: boolean;
}) {
  const errorCount = sources.filter((source) => source.health_status === "error").length;
  const disabledCount = sources.filter((source) => source.health_status === "disabled").length;
  const healthyCount = sources.filter((source) => source.health_status === "healthy").length;

  const unhealthy = errorCount > 0;
  const allDisabled = disabledCount === sources.length && sources.length > 0;

  const { tone, text, icon } = unhealthy
    ? {
        tone: "warning" as const,
        text: `${errorCount} issue${errorCount !== 1 ? "s" : ""}`,
        icon: <AlertTriangle className="h-3 w-3" />,
      }
    : allDisabled
      ? {
          tone: "muted" as const,
          text: "Free sources only",
          icon: <WifiOff className="h-3 w-3" />,
        }
      : {
          tone: "success" as const,
          text: "Healthy",
          icon: <CheckCircle2 className="h-3 w-3" />,
        };

  if (compact) {
    return (
      <Badge tone={tone} className="flex items-center gap-1">
        {icon}
        {text}
      </Badge>
    );
  }

  return (
    <Badge tone={tone} className="flex items-center gap-1.5" title={`${healthyCount} healthy | ${errorCount} errors | ${disabledCount} disabled`}>
      {icon}
      <span>{text}</span>
      <span className="opacity-60">|</span>
      <Database className="h-3 w-3" />
      <span>
        {sources.length} source{sources.length !== 1 ? "s" : ""}
      </span>
    </Badge>
  );
}
