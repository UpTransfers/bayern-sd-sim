import { CheckCircle2, AlertTriangle, XCircle, ExternalLink, Clock } from "lucide-react";
import type { DataSourceRecord } from "@/lib/types";

function syncAge(lastSyncedAt?: string | null): { stale: boolean; label: string } {
  if (!lastSyncedAt) return { stale: true, label: "Never synced" };
  const diff = Date.now() - new Date(lastSyncedAt).getTime();
  const hours = diff / 1000 / 60 / 60;
  if (hours < 1) return { stale: false, label: "Just synced" };
  if (hours < 24) return { stale: false, label: `${Math.round(hours)}h ago` };
  const days = Math.floor(hours / 24);
  return { stale: days > 7, label: `${days}d ago` };
}

function statusIcon(status: string): React.ReactNode {
  if (status === "ok" || status === "healthy") {
    return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  }
  if (status === "error") {
    return <XCircle className="h-3 w-3 text-red-500" />;
  }
  return <AlertTriangle className="h-3 w-3 text-amber-400" />;
}

export function SourceAttribution({
  sources,
  lastSyncedAt,
}: {
  sources: DataSourceRecord[];
  lastSyncedAt?: string | null;
}) {
  const { stale, label: syncLabel } = syncAge(lastSyncedAt);

  return (
    <div className="space-y-3 rounded-3xl border border-white/60 bg-white/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Data sources</p>
        <span className={`flex items-center gap-1.5 text-xs ${stale ? "text-amber-600" : "text-slate-500"}`}>
          <Clock className="h-3 w-3" />
          {syncLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <div
            key={source.id}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
            title={source.license_or_terms_note ?? source.source_name}
          >
            {statusIcon(source.health_status)}
            {source.source_url ? (
              <a
                href={source.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-slate-700 transition-colors hover:text-[#b80d19]"
              >
                {source.source_name}
                <ExternalLink className="h-2.5 w-2.5 opacity-50" />
              </a>
            ) : (
              <span className="text-xs text-slate-700">{source.source_name}</span>
            )}
          </div>
        ))}
      </div>
      {stale ? (
        <p className="text-xs text-amber-600">
          Data may be outdated. Click &quot;Sync Real Data&quot; to refresh.
        </p>
      ) : null}
    </div>
  );
}
