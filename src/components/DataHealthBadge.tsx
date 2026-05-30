import { Badge } from "@/components/ui/badge";
import type { DataSourceRecord } from "@/lib/types";

export function DataHealthBadge({ sources }: { sources: DataSourceRecord[] }) {
  const unhealthy = sources.some((source) => source.health_status === "error");
  const disabled = sources.every((source) => source.health_status === "disabled");
  const text = unhealthy
    ? "Data issues"
    : disabled
    ? "Free sources only"
    : "Healthy data";
  const tone = unhealthy ? "warning" : disabled ? "muted" : "success";
  return <Badge tone={tone}>{text}</Badge>;
}
