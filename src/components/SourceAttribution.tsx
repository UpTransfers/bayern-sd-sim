import type { DataSourceRecord } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function SourceAttribution({
  sources,
  lastSyncedAt,
}: {
  sources: DataSourceRecord[];
  lastSyncedAt?: string | null;
}) {
  return (
    <div className="space-y-2 rounded-3xl border border-white/60 bg-white/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Source attribution</p>
        <span className="text-xs text-slate-500">{lastSyncedAt ? `Last sync ${formatDate(lastSyncedAt)}` : "Not synced yet"}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <span
            key={source.id}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
            title={source.license_or_terms_note}
          >
            {source.source_name}
          </span>
        ))}
      </div>
    </div>
  );
}
