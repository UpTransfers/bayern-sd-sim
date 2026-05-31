"use client";

import { useState } from "react";
import {
  UserMinus,
  UserPlus,
  Target,
  Play,
  BarChart3,
  FileText,
  Filter,
  ArrowRightLeft,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type EventType = string;

function eventMeta(type: EventType): {
  icon: React.ReactNode;
  bg: string;
  tone: "success" | "warning" | "gold" | "muted";
} {
  const t = type.toLowerCase();
  if (t.includes("sell") || t.includes("sold")) {
    return {
      icon: <UserMinus className="h-4 w-4" />,
      bg: "bg-amber-100 text-amber-600",
      tone: "warning",
    };
  }
  if (t.includes("sign") || t.includes("bought") || t.includes("transfer_in")) {
    return {
      icon: <UserPlus className="h-4 w-4" />,
      bg: "bg-emerald-100 text-emerald-600",
      tone: "success",
    };
  }
  if (t.includes("loan")) {
    return {
      icon: <ArrowRightLeft className="h-4 w-4" />,
      bg: "bg-blue-100 text-blue-600",
      tone: "muted",
    };
  }
  if (t.includes("formation") || t.includes("lineup") || t.includes("tactic")) {
    return {
      icon: <BarChart3 className="h-4 w-4" />,
      bg: "bg-violet-100 text-violet-600",
      tone: "gold",
    };
  }
  if (t.includes("simul") || t.includes("season")) {
    return {
      icon: <Play className="h-4 w-4" />,
      bg: "bg-[#b80d19]/10 text-[#b80d19]",
      tone: "warning",
    };
  }
  if (t.includes("preseason") || t.includes("review")) {
    return {
      icon: <FileText className="h-4 w-4" />,
      bg: "bg-slate-100 text-slate-600",
      tone: "muted",
    };
  }
  if (t.includes("task")) {
    return {
      icon: <Target className="h-4 w-4" />,
      bg: "bg-slate-100 text-slate-600",
      tone: "muted",
    };
  }
  return {
    icon: <Clock className="h-4 w-4" />,
    bg: "bg-slate-100 text-slate-500",
    tone: "muted",
  };
}

function humanizeType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace("Transfer In", "Signed")
    .replace("Transfer Out", "Sold");
}

const FILTER_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Signings", value: "sign" },
  { label: "Sales", value: "sell" },
  { label: "Loans", value: "loan" },
  { label: "Tactics", value: "formation" },
] as const;

export function DecisionFeed({
  events,
}: {
  events: Array<{
    id: string;
    event_type: string;
    title: string;
    description: string;
    created_at: string;
  }>;
}) {
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all" ? events : events.filter((event) => event.event_type.toLowerCase().includes(filter));
  const visible = filtered.slice(0, 8);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Decision Feed</CardTitle>
            <CardDescription>Everything that changed, in order.</CardDescription>
          </div>
          {events.length > 0 ? <Badge tone="muted">{events.length} events</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length > 3 ? (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 pr-1 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-0">
            <Filter className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  filter === option.value
                    ? "bg-[#b80d19] text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-[#b80d19]/30"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {visible.length ? (
          <div className="relative space-y-0">
            <div className="absolute left-[1.25rem] top-4 bottom-4 w-px bg-slate-200 sm:left-[1.25rem]" aria-hidden />

            {visible.map((event) => {
              const meta = eventMeta(event.event_type);
              return (
                <div key={event.id} className="relative flex gap-3 pb-3 last:pb-0">
                  <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-white ${meta.bg}`}>
                    {meta.icon}
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{event.title}</p>
                        <Badge tone={meta.tone} className="shrink-0 text-[10px]">
                          {humanizeType(event.event_type)}
                        </Badge>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">{formatDate(event.created_at)}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-600">{event.description}</p>
                  </div>
                </div>
              );
            })}

            {filtered.length > 8 ? <p className="pl-12 text-xs text-slate-500">+{filtered.length - 8} more events</p> : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-6 text-center">
            <Clock className="h-6 w-6 text-slate-300" />
            <p className="text-sm text-slate-500">
              {filter === "all" ? "No decisions recorded yet." : `No ${filter} events yet.`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
