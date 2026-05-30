import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ClubRecord, MatchRecord, StandingRecord } from "@/lib/types";
import { boardObjectives } from "@/lib/football/board";
import { formatDate } from "@/lib/utils";

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
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>01. Pre-Season Review</CardTitle>
            <CardDescription>Board briefing, club profile, and current competitive context.</CardDescription>
          </div>
          <Badge tone={completed ? "success" : "warning"}>{completed ? "Complete" : "Pending"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Club" value={club?.name ?? "Unavailable from free source"} />
          <Field label="Country" value={club?.country ?? "Unavailable from free source"} />
          <Field label="Stadium" value={club?.venue ?? "Unavailable from free source"} />
          <Field label="Founded" value={club?.founded ? formatDate(club.founded) : "Unavailable from free source"} />
          <Field label="League" value="Bundesliga" />
          <Field label="Latest standing" value={standing ? `${standing.position}. ${standing.points ?? "?"} pts` : "Unavailable from free source"} />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Board objectives</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {boardObjectives({ lastFinish: standing?.position ?? undefined }).map((objective) => (
              <Badge key={objective} tone="muted" className="normal-case tracking-normal">
                {objective}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Recent Bayern matches</p>
          <div className="mt-3 space-y-2">
            {recentMatches.length ? recentMatches.map((match) => (
              <div key={match.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-950">{match.home_team} vs {match.away_team}</p>
                  <p className="text-xs text-slate-500">{formatDate(match.utc_date)} | {match.status}</p>
                </div>
                <p className="font-semibold text-slate-900">
                  {match.home_score ?? "?"} - {match.away_score ?? "?"}
                </p>
              </div>
            )) : (
              <p className="text-sm text-slate-600">Recent match data is unavailable from free sources right now.</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          If a field is missing, it remains labeled as unavailable from free source instead of being guessed.
        </div>

        <Button onClick={onComplete} className="w-full sm:w-auto">
          Confirm board briefing
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
