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

  return [
    {
      source: "iMiaSanMia style",
      handle: "@iMiaSanMia",
      tone: "news",
      headline: trophies.length ? "Bayern close the season with silverware" : "Bayern season review lands with edge",
      body: shortPost(
        pick(seed, "news", [
          `Bayern finished ${place} with ${points} points. ${summary.result?.verdict ?? "The final verdict was set by the season itself."} [Model]`,
          `Bayern ended the campaign on ${points} points, with the transfer window and the league run shaping the final picture. [Model]`,
          `Season recap: ${transferVerdict} The final table and cup paths tell the rest. [Model]`,
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
          `Leute sehen wieder ein paar gute Spiele und tun so, als wäre alles gelöst 😭 ${leaguePulse}`,
          `Kompany mal ruhig machen lassen, bevor wieder jeder zweite Thread den Kader neu sortiert.`,
          `Das ist so eine typische Bayern-Saison: genug Qualität, um Hoffnung zu machen, und genug Drama für die Replies.`,
        ]),
      ),
    },
    {
      source: "SebMinga style",
      handle: "@SebMinga",
      tone: "fan",
      headline: trophies.length ? "Südkurve energy" : "Munich mood",
      body: shortPost(
        pick(seed, "fan", [
          `Mehr Bayern geht immer, aber diese Saison hatte wenigstens Wucht. ${stadiumPulse}`,
          `Man kann diskutieren, aber wenn Bayern so auftritt, dann lebt das Ding. ${cupPulse}`,
          `Das ist genau die Art von Saison, über die man in München nicht nur spricht, sondern fühlt. ${transferPulse}`,
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
