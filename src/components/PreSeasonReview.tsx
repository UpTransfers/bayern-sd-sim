import { Target, Trophy, DollarSign, Users, TrendingUp, Heart, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ClubRecord, MatchRecord, StandingRecord } from "@/lib/types";
import { boardObjectives } from "@/lib/football/board";
import { formatDate } from "@/lib/utils";

type ObjectiveMeta = {
  icon: React.ReactNode;
  priority: "must" | "should" | "nice";
};

function objectiveMeta(text: string): ObjectiveMeta {
  const t = text.toLowerCase();
  if (t.includes("bundesliga") || t.includes("title") || t.includes("champions league")) {
    return { icon: <Trophy className="h-3.5 w-3.5" />, priority: "must" };
  }
  if (t.includes("budget") || t.includes("financial") || t.includes("cost")) {
    return { icon: <DollarSign className="h-3.5 w-3.5" />, priority: "should" };
  }
  if (t.includes("age") || t.includes("balance") || t.includes("youth")) {
    return { icon: <TrendingUp className="h-3.5 w-3.5" />, priority: "should" };
  }
  if (t.includes("fan") || t.includes("confidence") || t.includes("turnover")) {
    return { icon: <Heart className="h-3.5 w-3.5" />, priority: "nice" };
  }
  if (t.includes("squad") || t.includes("depth")) {
    return { icon: <Users className="h-3.5 w-3.5" />, priority: "should" };
  }
  return { icon: <Target className="h-3.5 w-3.5" />, priority: "nice" };
}

function matchResult(
  homeTeam: string,
  homeScore: number | null,
  awayScore: number | null,
): "W" | "D" | "L" | null {
  if (homeScore === null || awayScore === null) return null;
  const isBayern = homeTeam.toLowerCase().includes("bayern");
  const bayernScore = isBayern ? homeScore : awayScore;
  const opponentScore = isBayern ? awayScore : homeScore;
  if (bayernScore > opponentScore) return "W";
  if (bayernScore === opponentScore) return "D";
  return "L";
}

function priorityTone(priority: ObjectiveMeta["priority"]): "warning" | "gold" | "muted" {
  return priority === "must" ? "warning" : priority === "should" ? "gold" : "muted";
}

function priorityLabel(priority: ObjectiveMeta["priority"]): string {
  return priority === "must" ? "Must" : priority === "should" ? "Key" : "Bonus";
}

function Field({
  label,
  value,
  available = true,
}: {
  label: string;
  value: string;
  available?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${available ? "text-slate-950" : "italic text-slate-400"}`}>{value}</p>
    </div>
  );
}

function ObjectivePill({ text }: { text: string }) {
  const meta = objectiveMeta(text);
  const tone = priorityTone(meta.priority);
  const label = priorityLabel(meta.priority);

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
        meta.priority === "must"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : meta.priority === "should"
            ? "border-[#b80d19]/15 bg-[#b80d19]/5 text-slate-800"
            : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      <span
        className={meta.priority === "must" ? "text-amber-500" : meta.priority === "should" ? "text-[#b80d19]" : "text-slate-400"}
      >
        {meta.icon}
      </span>
      <span className="flex-1">{text}</span>
      <Badge tone={tone} className="text-[9px]">
        {label}
      </Badge>
    </div>
  );
}

function MatchRow({ match }: { match: MatchRecord }) {
  const result = matchResult(match.home_team, match.home_score ?? null, match.away_score ?? null);

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-medium text-slate-950">
          {match.home_team} <span className="mx-1 text-slate-400">vs</span> {match.away_team}
        </p>
        <p className="text-xs text-slate-500">
          {formatDate(match.utc_date)} · {match.status}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <p className="text-sm font-semibold text-slate-900">
          {match.home_score ?? "?"} – {match.away_score ?? "?"}
        </p>
        {result ? (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${
              result === "W"
                ? "bg-emerald-500 text-white"
                : result === "D"
                  ? "bg-slate-300 text-slate-700"
                  : "bg-red-500 text-white"
            }`}
          >
            {result}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PreSeasonReview({
  club,
  standing,
  recentMatches,
  onComplete,
  completed = false,
}: {
  club: ClubRecord | null;
  standing: StandingRecord | null;
  recentMatches: MatchRecord[];
  onComplete: () => void;
  completed?: boolean;
}) {
  const objectives = boardObjectives({ lastFinish: standing?.position ?? undefined });
  const mustCount = objectives.filter((objective) => objectiveMeta(objective).priority === "must").length;
  const hasData = Boolean(club?.name || standing);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>01. Pre-Season Review</CardTitle>
            <CardDescription>Board briefing, club profile, and competitive context for 2026-27.</CardDescription>
          </div>
          <Badge tone={completed ? "success" : "warning"}>
            {completed ? (
              <>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Complete
              </>
            ) : (
              "Pending"
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Club profile</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Club" value={club?.name ?? "Unavailable from free source"} available={Boolean(club?.name)} />
            <Field label="Country" value={club?.country ?? "Unavailable from free source"} available={Boolean(club?.country)} />
            <Field label="Stadium" value={club?.venue ?? "Unavailable from free source"} available={Boolean(club?.venue)} />
            <Field label="Founded" value={club?.founded ? formatDate(club.founded) : "Unavailable from free source"} available={Boolean(club?.founded)} />
            <Field label="League" value="Bundesliga" />
            <Field
              label="Current standing"
              value={standing ? `${standing.position}. — ${standing.points ?? "?"} pts` : "Unavailable from free source"}
              available={Boolean(standing)}
            />
          </div>
        </div>

        {standing ? (
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {[
              { label: "Won", value: standing.won ?? "—" },
              { label: "Drawn", value: standing.drawn ?? "—" },
              { label: "Lost", value: standing.lost ?? "—" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
                <p className="mt-1.5 text-xl font-black text-slate-950">{String(stat.value)}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Board objectives</p>
            <div className="flex gap-1.5">
              <Badge tone="warning">{mustCount} must-hit</Badge>
              <Badge tone="muted">{objectives.length} total</Badge>
            </div>
          </div>
          <div className="space-y-2">
            {objectives.map((objective) => (
              <ObjectivePill key={objective} text={objective} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Recent Bayern matches</p>
            {recentMatches.length > 0 ? (
              <div className="flex gap-1">
                {recentMatches.slice(0, 5).map((match, index) => {
                  const result = matchResult(match.home_team, match.home_score ?? null, match.away_score ?? null);
                  return (
                    <span
                      key={`${match.id}-${index}`}
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black ${
                        result === "W"
                          ? "bg-emerald-500 text-white"
                          : result === "D"
                            ? "bg-slate-300 text-slate-600"
                            : result === "L"
                              ? "bg-red-500 text-white"
                              : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {result ?? "?"}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            {recentMatches.length ? (
              recentMatches.map((match) => <MatchRow key={match.id} match={match} />)
            ) : (
              <p className="py-3 text-center text-sm text-slate-500">Recent match data unavailable from free sources.</p>
            )}
          </div>
        </div>

        {!hasData ? (
          <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>Some fields are unavailable from free sources right now. The app labels these explicitly rather than estimating them.</p>
          </div>
        ) : null}

        <Button onClick={onComplete} className="w-full sm:w-auto" disabled={completed}>
          {completed ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Board briefing confirmed
            </>
          ) : (
            "Confirm board briefing"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
