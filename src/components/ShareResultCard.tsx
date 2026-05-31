import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";

type ResultLine = {
  label: string;
  value: string;
};

export function ShareResultCard({
  clubName,
  seasonLabel,
  place,
  points,
  verdict,
  boardRating,
  fanRating,
  transferVerdict,
  bestDecision,
  worstDecision,
  keyTurningPoint,
  mediaHeadline,
  transferGrade,
  boardVerdict,
  fanVerdict,
  whyThisHappened,
  topScorer,
  topAssister,
  bestPlayer,
  breakoutPlayer,
  disappointment,
  trophies,
  transferIncomings,
  transferOutgoings,
  pokalLine,
  uclLine,
  highlights,
  fanPulse,
}: {
  clubName: string;
  seasonLabel: string;
  place: string;
  points: number | string;
  verdict: string;
  boardRating: number;
  fanRating: number;
  transferVerdict: string;
  bestDecision: string;
  worstDecision: string;
  keyTurningPoint: string;
  mediaHeadline: string;
  transferGrade: string;
  boardVerdict: string;
  fanVerdict: string;
  whyThisHappened: string;
  topScorer: string;
  topAssister: string;
  bestPlayer: string;
  breakoutPlayer: string;
  disappointment: string;
  trophies: string[];
  transferIncomings: string[];
  transferOutgoings: string[];
  pokalLine: string;
  uclLine: string;
  highlights?: ResultLine[];
  fanPulse?: ResultLine[];
}) {
  const compactWhy = compactText(whyThisHappened, 180);
  const compactBest = compactText(bestDecision, 72);
  const compactWorst = compactText(worstDecision, 72);
  const compactTurningPoint = compactText(keyTurningPoint, 72);
  const compactHeadline = compactText(mediaHeadline, 72);
  const compactTransferVerdict = compactText(transferVerdict, 96);
  const compactBoardVerdict = compactText(boardVerdict, 72);
  const compactFanVerdict = compactText(fanVerdict, 72);
  const compactPokal = compactCupLine(pokalLine);
  const compactUcl = compactCupLine(uclLine);

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="bg-[linear-gradient(135deg,#0f172a,#7f1d1d_55%,#b80d19)] px-6 py-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">{seasonLabel}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-2xl font-black tracking-tight">{clubName}</p>
            <p className="mt-1 text-sm text-white/80">Final snapshot</p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-black leading-none">{points}</p>
            <p className="mt-1 text-sm font-semibold text-white/80">{place}</p>
          </div>
        </div>
      </div>

      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Final verdict</CardTitle>
        <CardDescription>{verdict}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pb-6">
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Trophies</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <SeasonTile
              label="Bundesliga"
              status={trophies.includes("Bundesliga") ? "Won" : compactText(place, 18)}
              tone={trophies.includes("Bundesliga") ? "success" : "muted"}
              subtitle={trophies.includes("Bundesliga") ? "Title won" : "League finish"}
              accent="league"
            />
            <SeasonTile
              label="DFB-Pokal"
              status={trophies.includes("DFB-Pokal") ? "Won" : compactPokal}
              tone={trophies.includes("DFB-Pokal") ? "success" : "muted"}
              subtitle={trophies.includes("DFB-Pokal") ? "Cup won" : "Cup path"}
              accent="cup"
            />
            <SeasonTile
              label="Champions League"
              status={trophies.includes("Champions League") ? "Won" : compactUcl}
              tone={trophies.includes("Champions League") ? "success" : "muted"}
              subtitle={trophies.includes("Champions League") ? "Europe won" : "Europe path"}
              accent="ucl"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="muted">Trophies {trophies.length}</Badge>
          <Badge tone="muted">Board {boardRating}/100</Badge>
          <Badge tone="muted">Fans {fanRating}/100</Badge>
          <Badge tone="muted">Grade {compactText(transferGrade, 18)}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat label="Top scorer" value={topScorer} />
          <MiniStat label="Top assister" value={topAssister} />
          <MiniStat label="Best player" value={bestPlayer} />
          <MiniStat label="Breakout" value={breakoutPlayer} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat label="Miss" value={compactText(disappointment, 52)} />
          <MiniStat label="Window" value={compactTransferVerdict} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MovementBlock label="Incomings" items={transferIncomings} tone="success" />
          <MovementBlock label="Outgoings" items={transferOutgoings} tone="warning" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DetailBlock label="Best move" value={compactBest} />
          <DetailBlock label="Worst move" value={compactWorst} />
          <DetailBlock label="Turning point" value={compactTurningPoint} />
          <DetailBlock label="Headline" value={compactHeadline} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DetailBlock label="DFB-Pokal" value={compactPokal} />
          <DetailBlock label="Champions League" value={compactUcl} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat label="Board" value={compactBoardVerdict} />
          <MiniStat label="Fans" value={compactFanVerdict} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Why</p>
          <p className="mt-2">{compactWhy}</p>
        </div>

        {fanPulse?.length ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Fan pulse</p>
            <div className="grid gap-3">
              {fanPulse.map((post, index) => (
                <div key={`${post.label}-${index}`} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-950">@tzuianalyse</p>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Fan reaction</p>
                    </div>
                    <Badge tone="muted">{post.label}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{post.value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {highlights?.length ? (
          <div className="space-y-2">
            {highlights.map((item, index) => (
              <div key={`${item.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
          <span>Made by @tzuianalyse</span>
          <span>Fan-made result</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function SeasonTile({
  label,
  status,
  tone,
  subtitle,
  accent,
}: {
  label: string;
  status: string;
  tone: "success" | "muted";
  subtitle: string;
  accent: "league" | "cup" | "ucl";
}) {
  return (
    <div
      className={`rounded-3xl border px-4 py-4 shadow-sm ${
        tone === "success"
          ? accent === "league"
            ? "border-amber-200 bg-gradient-to-br from-amber-50 via-amber-100 to-white"
            : accent === "cup"
              ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-100 to-white"
              : "border-sky-200 bg-gradient-to-br from-sky-50 via-sky-100 to-white"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className={`mt-2 text-xl font-black ${tone === "success" ? "text-slate-950" : "text-slate-950"}`}>{status}</p>
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            tone === "success"
              ? accent === "league"
                ? "bg-amber-500 text-white"
                : accent === "cup"
                  ? "bg-emerald-600 text-white"
                  : "bg-sky-600 text-white"
              : "bg-slate-200 text-slate-500"
          }`}
        >
          <Trophy className="h-5 w-5" />
        </div>
      </div>
      <p className={`mt-2 text-sm leading-5 ${tone === "success" ? "text-slate-700" : "text-slate-500"}`}>{subtitle}</p>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function MovementBlock({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "success" | "warning";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <Badge tone={tone === "success" ? "success" : "warning"}>{items.length}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item, index) => (
            <span
              key={`${label}-${item}-${index}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
              }`}
            >
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-500">No {label.toLowerCase()} recorded</span>
        )}
      </div>
    </div>
  );
}

function compactText(value: string, maxLength: number) {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function compactCupLine(value: string) {
  const text = value.trim();
  if (!text) return text;
  if (/^lost to /i.test(text)) {
    const roundMatch = text.match(/in ([^(]+)(?:\s*\(|$)/i);
    const round = roundMatch?.[1]?.trim() ?? "exit";
    const score = text.match(/\(([^)]+)\)/)?.[1]?.trim();
    return `${compactRound(round)} exit${score ? ` ${score}` : ""}`;
  }
  return compactText(text, 28);
}

function compactRound(round: string) {
  const lowered = round.toLowerCase();
  if (lowered.includes("round of 16")) return "R16";
  if (lowered.includes("round 16")) return "R16";
  if (lowered.includes("quarter")) return "QF";
  if (lowered.includes("semi")) return "SF";
  if (lowered.includes("final")) return "Final";
  if (lowered.includes("league")) return "League";
  return round;
}
