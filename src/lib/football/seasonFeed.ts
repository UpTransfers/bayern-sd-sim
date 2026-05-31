import type { SimulationSummary } from "@/lib/types";
import { stableId } from "@/lib/utils";
import { buildFanPulse } from "./fanPulse";

export type SeasonFeedPost = {
  source: string;
  handle: string;
  tone: "news" | "banter" | "fan" | "analysis";
  headline: string;
  body: string;
};

export function buildSeasonFeed({
  simulationId,
  summary,
  place,
  points,
  trophies,
  verdictLine,
  transferVerdict,
  whySummary,
}: {
  simulationId: string;
  summary: SimulationSummary;
  place: string;
  points: number | string;
  trophies: string[];
  verdictLine: string;
  transferVerdict: string;
  whySummary: string;
}): SeasonFeedPost[] {
  const pulse = buildFanPulse({
    simulationId,
    summary,
    place,
    points,
    trophies,
    verdictLine,
    transferVerdict,
  });

  const seed = stableId("season-feed", simulationId, String(points), place, trophies.join("|"), verdictLine, transferVerdict, whySummary);
  const leaguePulse = pulse.find((item) => item.label === "League pulse")?.value ?? verdictLine;
  const transferPulse = pulse.find((item) => item.label === "Transfers")?.value ?? transferVerdict;
  const cupPulse = pulse.find((item) => item.label === "Cup mood")?.value ?? verdictLine;
  const stadiumPulse = pulse.find((item) => item.label === "Stadium chat")?.value ?? verdictLine;
  const keyDecision = summary.result?.best_decision ?? "No single move defined the season.";
  const worstDecision = summary.result?.worst_decision ?? "No obvious mistake defined the season.";

  return [
    {
      source: "iMiaSanMia style",
      handle: "@iMiaSanMia",
      tone: "news",
      headline: trophies.length ? "Bayern close the season with silverware" : "Bayern season review lands with edge",
      body: shortPost(
        pick(seed, "news", [
          `Bayern finished ${place} with ${points} points. ${summary.result?.verdict ?? "The final verdict was set by the season itself."} [Model]`,
          `Bayern end the campaign on ${points} points. Clean enough on paper, but the replies will pick holes anyway. [Model]`,
          `Season recap: ${transferVerdict}. That is the part everybody will argue about first. [Model]`,
          `Officially: ${points} points and a ${place} finish. Unofficially: the timeline already has opinions. [Model]`,
        ]),
      ),
    },
    {
      source: "novadejavu style",
      handle: "@novadejavu",
      tone: "banter",
      headline: "Timeline reaction",
      body: shortPost(
        pick(seed, "banter", [
          `Leute sehen drei gute Spiele und twittern direkt als waere Bayern frei von Problemen. ${leaguePulse}`,
          `Kompany kann nicht einmal atmen, ohne dass hier jemand eine 4-2-3-1-2-Notfallgrafik bastelt.`,
          `Das ist so eine typische Bayern-Saison: genug Qualitaet fuer Hoffnung, genug Chaos fuer 18 Threads.`,
          `Bayern gewinnt und trotzdem steht der Kommentarbereich da wie nach einem 0:0 gegen Augsburg.`,
          `Jeder kennt ploetzlich die perfekte Startelf. Faszinierend, wie das jedes Wochenende passiert.`,
        ]),
      ),
    },
    {
      source: "SebMinga style",
      handle: "@SebMinga",
      tone: "fan",
      headline: trophies.length ? "Suedkurve energy" : "Munich mood",
      body: shortPost(
        pick(seed, "fan", [
          `Mehr Bayern geht immer, aber diese Saison hatte wenigstens Wucht. ${stadiumPulse}`,
          `Man kann diskutieren, aber wenn Bayern so auftritt, dann lebt das Ding. ${cupPulse}`,
          `Das ist genau die Art von Saison, ueber die man in Muenchen nicht nur spricht, sondern fuehlt. ${transferPulse}`,
          `Wenn Bayern ernst macht, merkt man es sofort. Wenn nicht, merkt es leider auch jeder.`,
          `Manchmal reicht ein Spiel, um wieder die ganze Fanbase in den Kommentaren aufzuruehren.`,
        ]),
      ),
    },
    {
      source: "analysis",
      handle: "@tzuianalyse",
      tone: "analysis",
      headline: "What actually decided the season",
      body: shortPost(
        pick(seed, "analysis", [
          `The real swing was the gap between ${keyDecision} and ${worstDecision}. That is where the table moved, not in the headlines.`,
          `The season reads best as a mix of ${transferPulse.toLowerCase()} and the final ${leaguePulse.toLowerCase()}.`,
          `The numbers say Bayern never fully lost control, but the margin for error was shaped by ${whySummary.toLowerCase()}.`,
          `If you want the blunt version: the good bits were loud, the bad bits were expensive, and the replies knew it.`,
          `The headline is one thing. The actual swing was much more about decision quality than vibes.`,
        ]),
      ),
    },
    {
      source: "reply thread",
      handle: "@tzuianalyse",
      tone: "analysis",
      headline: "Hot take reply",
      body: shortPost(
        pick(seed, "reply", [
          `Not every season needs a meltdown. Sometimes the point is just that Bayern left too many easy debates on the table.`,
          `The funny part is that the season usually explains itself before the fanbase does.`,
          `This is the kind of run where one bad month changes the whole tone of the comment section.`,
          `The football was good enough to hope, but never boring enough to stop the arguments.`,
        ]),
      ),
    },
  ];
}

function shortPost(text: string, maxLength = 220) {
  const value = text.trim().replace(/\s+/g, " ");
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function pick(seed: string, channel: string, variants: string[]) {
  if (!variants.length) return "";
  const index = Math.floor(random(seed, channel) * variants.length) % variants.length;
  return variants[index];
}

function random(seed: string, channel: string) {
  const value = stableId("season-feed-random", seed, channel);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}
