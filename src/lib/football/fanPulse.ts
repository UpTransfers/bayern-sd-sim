import type { SimulationSummary } from "@/lib/types";
import { stableId } from "@/lib/utils";

export type FanPulseItem = {
  label: string;
  value: string;
};

type FanPulseInput = {
  simulationId: string;
  summary: SimulationSummary;
  place: string;
  points: number | string;
  trophies: string[];
  verdictLine: string;
  transferVerdict: string;
};

export function buildFanPulse({
  simulationId,
  summary,
  place,
  points,
  trophies,
  verdictLine,
  transferVerdict,
}: FanPulseInput): FanPulseItem[] {
  const result = summary.result;
  const seasonOutcome = parseMethodologyOutcome(result?.methodology_json);
  const seed = stableId(
    "fan-pulse",
    simulationId,
    String(points),
    place,
    trophies.join("|"),
    transferVerdict,
    verdictLine,
    String(result?.id ?? ""),
    String(summary.signings.length),
    String(summary.soldPlayerIds.length),
    String(summary.loanedPlayerIds.length),
  );

  const signedNames = summary.signings.slice(0, 2).map((item) => item.player_name);
  const soldCount = summary.soldPlayerIds.length;
  const loanCount = summary.loanedPlayerIds.length;
  const unlocked = seasonOutcome.achievements?.filter((item) => item.unlocked).length ?? 0;
  const boardScore = summary.result?.board_confidence_score ?? 0;
  const fanScore = summary.result?.fan_confidence_score ?? 0;
  const transferCount = summary.signings.length + soldCount + loanCount;
  const pokal = seasonOutcome.pokal;
  const ucl = seasonOutcome.ucl;

  const lines: FanPulseItem[] = [];

  lines.push({
    label: "League pulse",
    value: leagueReaction(place, String(points), trophies, verdictLine, seed, fanScore),
  });

  lines.push({
    label: "Transfers",
    value: transferReaction(summary, transferVerdict, signedNames, soldCount, loanCount, transferCount, boardScore, seed),
  });

  lines.push({
    label: "Cup mood",
    value: cupReaction(pokal, ucl, trophies, points, seed),
  });

  lines.push({
    label: "Stadium chat",
    value: stadiumReaction(place, trophies.length, unlocked, boardScore, fanScore, seed),
  });

  if (unlocked > 0 || trophies.length > 0) {
    lines.push({
      label: "Mood",
      value: achievementReaction(unlocked, trophies.length, seed),
    });
  }

  return lines.slice(0, 5);
}

function parseMethodologyOutcome(value: unknown): {
  achievements?: Array<{ unlocked?: boolean; title?: string; description?: string }>;
  pokal?: { round?: string; opponent?: string | null; score?: string; winner?: string };
  ucl?: { round?: string; opponent?: string | null; score?: string; winner?: string };
} {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const seasonOutcome = (record.seasonOutcome as Record<string, unknown> | undefined) ?? {};
  return {
    achievements: Array.isArray(seasonOutcome.achievements) ? (seasonOutcome.achievements as Array<{ unlocked?: boolean; title?: string; description?: string }>) : undefined,
    pokal: seasonOutcome.pokal as { round?: string; opponent?: string | null; score?: string; winner?: string } | undefined,
    ucl: seasonOutcome.ucl as { round?: string; opponent?: string | null; score?: string; winner?: string } | undefined,
  };
}

function leagueReaction(place: string, points: string, trophies: string[], verdictLine: string, seed: string, fanScore: number) {
  const position = Number.parseInt(place, 10);
  const topLine = trophies.length ? "The trophy cabinet is alive again." : "The standard is still title-or-bust.";
  const variants =
    position === 1
      ? [
          `League title, ${points} points, and the usual Bayern pressure survived another year.`,
          `First place again. The title was expected, but it still needed control to look this clean.`,
          `Bayern finished on top and the fanbase is already moving the goalposts for next season.`,
          `Champions again, but the post-match chat still found a few things to moan about.`,
        ]
      : position === 2
        ? [
          `Second place with ${points} points still feels short in Munich, even if the football was mostly strong.`,
          `Runner-up is not the standard, but ${points} points keeps the season from feeling broken.`,
          `The league was good, not ruthless enough. Bayern fans will always treat second as unfinished business.`,
          `A decent season, but the fan timeline is already split between patience and frustration.`,
        ]
      : [
          `A finish of ${place} with ${points} points turns every good run into a what-if debate.`,
          `This was a season with some good moments, but the finish still left the Bayern crowd restless.`,
          `The league output landed below the usual Bayern bar, so the verdict is going to be loud.`,
          `The mood is not hostile, but it is definitely not relaxed either.`,
        ];

  const moodTail =
    fanScore >= 75
      ? "The crowd is mostly in celebration mode."
      : fanScore >= 55
        ? "Supporters are split but still engaged."
        : "The mood is sharp enough that every post gets a fight in the replies.";

  return `${pick(seed, "league", variants)} ${topLine} ${shortTail(verdictLine, seed, "league-tail")} ${moodTail}`;
}

function transferReaction(
  summary: SimulationSummary,
  transferVerdict: string,
  signedNames: string[],
  soldCount: number,
  loanCount: number,
  transferCount: number,
  boardScore: number,
  seed: string,
) {
  const signings = summary.signings.length;
  const variants: string[] = [];
  if (signings > 0) {
    variants.push(
      signedNames.length
        ? `The window had a proper storyline: ${signedNames.join(" and ")} arrived and changed the mood immediately.`
        : `The window actually moved the squad, not just the spreadsheet, and that matters at Bayern.`,
      `Some fans liked the restraint, others wanted another monster signing. That split is very Bayern.`,
      `The transfers were judged less on noise and more on whether the squad looked stronger on the pitch.`,
      `It felt like a proper sporting-director window: some applause, some debate, and one or two instant verdicts.`,
    );
  }
  if (soldCount > 0) {
    variants.push(
      `${soldCount} sale${soldCount === 1 ? "" : "s"} made the squad feel lighter and the board more comfortable.`,
      `The departures were part of the plan, but fans always argue about who should have stayed.`,
      `The exits gave the squad a cleaner shape, even if a few names will be argued about for months.`,
    );
  }
  if (loanCount > 0) {
    variants.push(
      `${loanCount} loan${loanCount === 1 ? "" : "s"} kept the pathway open for the younger players.`,
      `The loan decisions made the future clearer, even if not everyone agreed with the short-term depth.`,
      `The loan list quietly tells the real story: Bayern are planning a next step, not just a next match.`,
    );
  }
  if (!variants.length) {
    variants.push(
      `No big transfer drama, which is sometimes the most Bayern outcome of all.`,
      `A quiet window can still work if the squad structure stays sharp.`,
      `Not every summer needs fireworks; sometimes the reaction is just a relieved nod.`,
    );
  }
  variants.push(
    transferVerdict,
    boardScore >= 70
      ? "The board seems comfortable, but the fanbase still wants one more ruthless move."
      : "The fanbase always wants one more ruthless move, even after a sensible window.",
    transferCount >= 4
      ? "That was enough movement to keep the comments section busy all summer."
      : "Some supporters still think the window needed one more headline.",
  );
  return pick(seed, "transfer", variants);
}

function cupReaction(
  pokal: { round?: string; opponent?: string | null; score?: string; winner?: string } | undefined,
  ucl: { round?: string; opponent?: string | null; score?: string; winner?: string } | undefined,
  trophies: string[],
  points: number | string,
  seed: string,
) {
  const variants: string[] = [];
  if (trophies.includes("DFB-Pokal")) {
    variants.push("The Pokal run ended with silverware, which is exactly how Bayern supporters judge it.");
    variants.push("Cup day did the job, and the replies were pure Bayern entitlement in the best way.");
  } else if (pokal?.round) {
    variants.push(
      pokal.winner && pokal.winner !== "Bayern Munich"
        ? `The Pokal exit in ${pokal.round} kept the cup conversation alive for the wrong reason.`
        : `The Pokal run reached ${pokal.round}, which left the fanbase somewhere between satisfied and annoyed.`,
      `The cup ride had enough chaos to feel real, which is at least better than a scripted walkover.`,
    );
  }

  if (trophies.includes("Champions League")) {
    variants.push("Europe ended with a trophy, so the timeline suddenly looks bigger than the noise.");
    variants.push("That is the sort of Champions League ending that makes a fanbase forget its arguments for a week.");
  } else if (ucl?.round) {
    variants.push(
      ucl.winner && ucl.winner !== "Bayern Munich"
        ? `The Champions League exit at ${ucl.round} was the kind of result that gets replayed for weeks.`
        : `The Champions League run got to ${ucl.round}, which keeps the ambition story alive.`,
      `The European run had enough tension to keep the fanbase checking the tie score three times.`,
    );
  }

  if (!variants.length) {
    variants.push(
      "The knockout side of the season still felt like Bayern football: expectant, but never fully safe.",
      "The cup narrative was volatile enough to feel real, which is better than a scripted walkover.",
      "It had enough weird moments to feel like a real Bayern season instead of a clean spreadsheet output.",
    );
  }

  variants.push(
    Number(points) >= 78
      ? "The cup section will always be judged by the final scoreboard, not the build-up."
      : "The cup section will always be judged by the final scoreboard, not the build-up.",
  );

  return pick(seed, "cup", variants);
}

function stadiumReaction(place: string, trophies: number, unlocked: number, boardScore: number, fanScore: number, seed: string) {
  const position = Number.parseInt(place, 10);
  const variants =
    position === 1
      ? [
          "The mood in the stands was full of that smug Bayern certainty that only comes with a title.",
          "You could almost hear the collective nod: good, but now do it again.",
          "The crowd looked satisfied, which in Munich is basically a temporary ceasefire.",
        ]
      : position === 2
        ? [
            "The stadium reaction felt like approval with a raised eyebrow.",
            "Fans gave the season credit, then immediately asked what the next fix is.",
            "There was applause, but it came with a lot of coaching from the seats.",
          ]
        : [
            "The matchday mood was half patience, half public questioning of the project.",
            "The stands did not turn toxic, but they definitely did not relax either.",
            "It had the kind of energy that keeps every debate alive until August.",
          ];

  const modifier =
    trophies > 0
      ? "A trophy softened the mood."
      : boardScore >= 70
        ? "The board looked calmer than the fan timeline."
        : "The replies were louder than the applause.";
  const socialVariance =
    fanScore >= 80
      ? "The comments were unusually generous for Bayern standards."
      : fanScore >= 60
        ? "The replies were mixed, but at least not bored."
        : "The fanbase was in full debate mode.";

  return `${pick(seed, "stadium", variants)} ${modifier} ${socialVariance}`;
}

function achievementReaction(unlocked: number, trophies: number, seed: string) {
  const variants =
    trophies > 0
      ? [
          `${trophies} trophy${trophies === 1 ? "" : "ies"} and ${unlocked} unlock${unlocked === 1 ? "" : "s"} made the season feel alive.`,
          `The badges matter because Bayern fans still measure seasons by silverware first.`,
          "Winning kept the feed happy, but nobody in Munich ever calls it enough.",
          "The achievement list had enough bite to keep the comment section playful.",
        ]
      : [
          `${unlocked} achievement${unlocked === 1 ? "" : "s"} were unlocked, but the pressure stayed heavier than the medals.`,
          "The badge hunt helped, but Bayern supporters always want a bigger headline.",
          "Some seasons are remembered by the feeling more than the badge count.",
          "The badges were fun, but they did not stop the demanding questions.",
        ];

  return pick(seed, "achievement", variants);
}

function pick(seed: string, channel: string, variants: string[]) {
  if (!variants.length) return "";
  const index = Math.floor(random(seed, channel) * variants.length) % variants.length;
  return variants[index];
}

function random(seed: string, channel: string) {
  const value = stableId("fan-pulse-random", seed, channel);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function shortTail(text: string, seed: string, channel: string) {
  const tails = [
    "That is still the kind of finish Bayern fans debate all summer.",
    "It’s a proper Bayern season only when the margins start a fight.",
    "The discussion point is never the lack of pressure, only whether the answer was ruthless enough.",
  ];
  return `${text} ${pick(seed, channel, tails)}`;
}
