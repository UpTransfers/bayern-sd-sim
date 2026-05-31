"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { deriveRosterEntryProfile } from "@/lib/football/playerModel";
import type { SimulationRosterEntry } from "@/lib/types";

type GroupKey = "gk" | "rb" | "cb" | "lb" | "mid" | "am" | "wing" | "st";

type SquadGroup = {
  key: GroupKey;
  label: string;
  targetMin: number;
  targetMax: number;
  note: string;
};

type DepthStatus = "elite" | "strong" | "balanced" | "thin" | "critical" | "overloaded";

type ClassifiedPlayer = {
  id: string;
  name: string;
  age: number;
  kind: SimulationRosterEntry["kind"];
  importanceScore: number;
  importance: string | null;
  injuryRisk: number;
  pathway: number;
  minutes: string | null;
  boardSaleStance: string | null;
  isCurated: boolean;
  sourceLabel: string | null;
  sourceNote: string | null;
  primaryGroup: GroupKey | null;
  coverGroup: GroupKey | null;
  primaryGroups: GroupKey[];
  coverGroups: GroupKey[];
  coverWeight: number;
};

type CatalogPlayerMeta = SimulationRosterEntry["player"] & {
  player_importance?: string | null;
  tactical_role?: string | null;
  injury_risk?: number | null;
  academy_pathway_value?: number | null;
  minutes_expectation?: string | null;
  board_sale_stance?: string | null;
  source_label?: string | null;
  source_note?: string | null;
  external_source?: string | null;
};

const GROUPS: SquadGroup[] = [
  { key: "gk", label: "GK", targetMin: 2, targetMax: 3, note: "No. 1 plus emergency cover." },
  { key: "rb", label: "RB", targetMin: 2, targetMax: 4, note: "Right-side width and recovery cover." },
  { key: "cb", label: "CB", targetMin: 4, targetMax: 6, note: "Core centre-back depth and utility cover." },
  { key: "lb", label: "LB", targetMin: 2, targetMax: 4, note: "Left-side width and recovery cover." },
  { key: "mid", label: "DM/CM", targetMin: 3, targetMax: 6, note: "Control, pressing resistance, and rest defence." },
  { key: "am", label: "AM", targetMin: 2, targetMax: 4, note: "Between-the-lines creators and 10s." },
  { key: "wing", label: "LW/RW", targetMin: 3, targetMax: 5, note: "Primary wide threats plus a light cover layer." },
  { key: "st", label: "ST", targetMin: 2, targetMax: 4, note: "Box references and striker depth." },
];

export function SquadDepthMap({ roster }: { roster: SimulationRosterEntry[] }) {
  const classifiedRoster = useMemo(() => classifyRoster(roster), [roster]);
  const groups = useMemo(() => GROUPS.map((group) => analyzeGroup(group, classifiedRoster)), [classifiedRoster]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Squad Depth Map</CardTitle>
        <CardDescription>Primary depth counts first. Cover depth is shown separately so flexibility does not get overstated.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {groups.map((group) => (
            <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{group.label}</p>
                  <p className="mt-1 text-base font-black text-slate-950 sm:text-lg">
                    {group.primaryCount} primary + {group.coverCount} cover
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{group.primaryCount + group.coverCount} usable options</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Target {group.targetMin} core + {Math.max(0, group.targetMax - group.targetMin)} cover
                  </p>
                </div>
                <Badge tone={statusTone(group.status)}>{group.status}</Badge>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${statusBar(group.status)}`} style={{ width: `${group.depthPercent}%` }} />
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Primary</span>
                  {group.primaryPlayers.length ? (
                    group.primaryPlayers.slice(0, 4).map((player) => (
                      <Badge key={player.id} tone={playerBadgeTone(player.importanceScore)} className="normal-case tracking-normal">
                        {player.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">No primary options</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cover</span>
                  {group.coverPlayers.length ? (
                    group.coverPlayers.slice(0, 6).map((player) => (
                      <Badge key={player.id} tone="muted" className="normal-case tracking-normal">
                        {player.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">No secondary cover</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                <span className="rounded-full bg-slate-50 px-2.5 py-1">Top fit {group.topFitLabel}</span>
                <span className="rounded-full bg-slate-50 px-2.5 py-1">Injury {group.injuryLabel}</span>
                <span className="rounded-full bg-slate-50 px-2.5 py-1">Pathway {group.pathwayLabel}</span>
              </div>

              <div className="mt-3 space-y-2">
                {group.warnings.length ? (
                  group.warnings.map((warning) => (
                    <p key={warning} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
                      {warning}
                    </p>
                  ))
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-500">
                    Coverage looks reasonable for now.
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {group.sourceBadge ? <Badge tone={group.sourceBadge.tone}>{group.sourceBadge.label}</Badge> : null}
                {group.curatedShare > 0 && group.sourceNote ? (
                  <Badge tone="muted" className="normal-case tracking-normal">
                    {group.sourceNote}
                  </Badge>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function analyzeGroup(group: SquadGroup, roster: ClassifiedPlayer[]) {
  const primaryPlayers = roster
    .filter((player) => player.primaryGroups.includes(group.key))
    .sort((a, b) => b.importanceScore - a.importanceScore || a.age - b.age || a.name.localeCompare(b.name));
  const coverPlayers = roster
    .filter((player) => !player.primaryGroups.includes(group.key) && player.coverGroups.includes(group.key))
    .sort((a, b) => b.importanceScore - a.importanceScore || a.age - b.age || a.name.localeCompare(b.name));
  const allPlayers = [...primaryPlayers, ...coverPlayers];
  const primaryCount = primaryPlayers.length;
  const coverCount = coverPlayers.length;
  const coverDepth = coverPlayers.reduce((sum, player) => sum + player.coverWeight, 0);
  const effectiveDepth = primaryCount + coverDepth;
  const curatedShare = allPlayers.length ? allPlayers.filter((player) => player.isCurated).length / allPlayers.length : 0;
  const avgInjuryRisk = allPlayers.length ? allPlayers.reduce((sum, player) => sum + player.injuryRisk, 0) / allPlayers.length : 0;
  const avgPathway = allPlayers.length ? allPlayers.reduce((sum, player) => sum + player.pathway, 0) / allPlayers.length : 0;
  const youthCount = allPlayers.filter((player) => player.age <= 22).length;
  const sourceBadge = curatedShare >= 0.6 ? { label: "Curated fallback", tone: "warning" as const } : curatedShare > 0 ? { label: "Mixed sources", tone: "gold" as const } : null;

  return {
    ...group,
    primaryCount,
    coverCount,
    primaryPlayers,
    coverPlayers,
    status: depthStatus(group, primaryCount, coverCount, effectiveDepth),
    depthPercent: Math.min(100, Math.round((effectiveDepth / Math.max(group.targetMax, 1)) * 100)),
    warnings: depthWarnings(group, primaryCount, coverCount, avgInjuryRisk, avgPathway, youthCount),
    sourceBadge,
    curatedShare,
    sourceNote: curatedShare >= 0.6 ? "Mostly curated fallback data" : curatedShare > 0 ? "Partly curated fallback data" : null,
    topFitLabel: topFitLabel(primaryPlayers[0] ?? coverPlayers[0]),
    injuryLabel: injuryLabel(avgInjuryRisk),
    pathwayLabel: pathwayLabel(avgPathway),
  };
}

function classifyRoster(roster: SimulationRosterEntry[]) {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  return roster
    .filter((entry) => {
      const idKey = normalizeName(entry.id);
      const nameKey = normalizeName(entry.player.name);
      if (seenIds.has(idKey) || seenNames.has(nameKey)) return false;
      seenIds.add(idKey);
      seenNames.add(nameKey);
      return true;
    })
    .map((entry) => {
      const player = entry.player;
      const profile = deriveRosterEntryProfile(entry);
      const catalogMeta = entry.kind === "catalog" ? (player as CatalogPlayerMeta) : null;
      const tacticalRole = getRosterTacticalRole(entry, catalogMeta);
      const importance = catalogMeta?.player_importance ?? null;
      const minutes = catalogMeta?.minutes_expectation ?? null;
      const injuryRisk = catalogMeta?.injury_risk ?? 30;
      const membership = inferGroupMembership({
        position: player.position,
        tacticalRole,
        name: player.name,
        kind: entry.kind,
        importance,
        minutes,
        injuryRisk,
      });
      return {
        id: entry.id,
        name: player.name,
        age: player.age ?? 99,
        kind: entry.kind,
        importanceScore: importanceScore(entry, profile.rating, profile.form),
        importance,
        injuryRisk,
        pathway: catalogMeta?.academy_pathway_value ?? 0,
        minutes,
        boardSaleStance: catalogMeta?.board_sale_stance ?? null,
        isCurated: Boolean(catalogMeta && catalogMeta.external_source === "manual"),
        sourceLabel: catalogMeta ? catalogMeta.source_label ?? null : "Simulator estimate",
        sourceNote: catalogMeta ? catalogMeta.source_note ?? null : null,
        primaryGroup: membership.primaryGroups[0] ?? null,
        coverGroup: membership.coverGroups[0] ?? null,
        primaryGroups: membership.primaryGroups,
        coverGroups: membership.coverGroups,
        coverWeight: coverWeight(entry.kind, importance, minutes),
      } satisfies ClassifiedPlayer;
    })
    .sort((a, b) => b.importanceScore - a.importanceScore || a.age - b.age || a.name.localeCompare(b.name));
}

function importanceScore(entry: SimulationRosterEntry, rating: number, form: number) {
  const importance = entry.kind === "catalog" ? entry.player.player_importance ?? null : null;
  const base =
    importance === "core"
      ? 100
      : importance === "starter"
        ? 88
        : importance === "rotation"
          ? 74
          : importance === "development"
            ? 56
            : importance === "loan_candidate"
              ? 62
              : importance === "sellable"
                ? 60
                : entry.player.age !== null && entry.player.age <= 21
                  ? 68
                  : 52;
  return Math.round(base * 0.55 + rating * 0.28 + form * 0.17);
}

function depthStatus(group: SquadGroup, primaryCount: number, coverCount: number, effectiveDepth: number): DepthStatus {
  if (!primaryCount && !coverCount) return "critical";
  if (primaryCount === 1 && effectiveDepth < 1.7) return "critical";
  if (primaryCount < group.targetMin && effectiveDepth < group.targetMin) return "thin";
  if (effectiveDepth >= group.targetMax + 1) return "overloaded";
  if (primaryCount >= group.targetMin + 1 || effectiveDepth >= group.targetMin + 0.8) return "strong";
  if (effectiveDepth >= Math.max(1.5, group.targetMin - 0.4)) return "balanced";
  return "thin";
}

function depthWarnings(group: SquadGroup, primaryCount: number, coverCount: number, avgInjuryRisk: number, avgPathway: number, youthCount: number) {
  const warnings: string[] = [];

  if (!primaryCount && !coverCount) {
    warnings.push(`${group.label} has no natural options. This is a real squad hole.`);
    return warnings;
  }

  if (primaryCount === 1) {
    warnings.push(`${group.label} is critical. One injury or sale would create a real problem.`);
  } else if (primaryCount < group.targetMin) {
    warnings.push(`${group.label} is thin. The first injury or suspension will matter.`);
  }

  if (primaryCount + coverCount >= group.targetMax + 2) {
    warnings.push(`${group.label} is overloaded. Minutes may be hard to spread fairly.`);
  }

  if (primaryCount < group.targetMin && coverCount > primaryCount) {
    warnings.push("Cover is doing too much of the work here.");
  }

  if (avgInjuryRisk >= 55) {
    warnings.push(`${group.label} carries elevated injury risk.`);
  }

  const blockedYouth = youthCount > 0 && avgPathway < 40;
  if (blockedYouth) {
    warnings.push("Youth pathway looks blocked in this area.");
  }

  return warnings;
}

function topFitLabel(player: ClassifiedPlayer | undefined) {
  if (!player) return "unknown";
  if (player.importanceScore >= 88) return "elite";
  if (player.importanceScore >= 74) return "strong";
  if (player.importanceScore >= 60) return "balanced";
  return "emergency";
}

function injuryLabel(value: number) {
  if (value >= 65) return "high";
  if (value >= 40) return "medium";
  return "low";
}

function pathwayLabel(value: number) {
  if (value >= 70) return "strong";
  if (value >= 40) return "open";
  return "blocked";
}

function statusTone(status: DepthStatus) {
  if (status === "elite" || status === "strong") return "success" as const;
  if (status === "balanced") return "gold" as const;
  if (status === "thin") return "warning" as const;
  if (status === "critical" || status === "overloaded") return "warning" as const;
  return "muted" as const;
}

function playerBadgeTone(score: number) {
  if (score >= 88) return "warning" as const;
  if (score >= 74) return "gold" as const;
  if (score >= 60) return "muted" as const;
  return "success" as const;
}

function statusBar(status: DepthStatus) {
  if (status === "elite" || status === "strong") return "bg-gradient-to-r from-emerald-500 to-emerald-400";
  if (status === "balanced") return "bg-gradient-to-r from-amber-400 to-yellow-300";
  if (status === "thin") return "bg-gradient-to-r from-orange-400 to-amber-300";
  if (status === "critical") return "bg-gradient-to-r from-red-500 to-rose-400";
  return "bg-gradient-to-r from-slate-400 to-slate-300";
}

function inferGroupMembership(input: {
  position: string | null;
  tacticalRole: string | null;
  name: string;
  kind: SimulationRosterEntry["kind"];
  importance: string | null;
  minutes: string | null;
  injuryRisk: number;
}) {
  const override = nameOverride(normalizeName(input.name));
  if (override) {
    return {
      primaryGroups: override.primary ? [override.primary] : [],
      coverGroups: [...new Set([...(override.cover ?? []), ...genericCoverGroups(input.position, input.tacticalRole, input.name, override.primary)])].filter(
        (group): group is GroupKey => Boolean(group) && group !== override.primary,
      ),
    };
  }

  const primary = inferPrimaryGroup(input.position, input.tacticalRole, input.name);
  const coverGroups = genericCoverGroups(input.position, input.tacticalRole, input.name, primary);
  const primaryGroups = primary && countsAsPrimary(input.kind, input.importance, input.minutes, input.injuryRisk) ? [primary] : [];
  if (primary && !primaryGroups.length) coverGroups.unshift(primary);
  return {
    primaryGroups,
    coverGroups: [...new Set(coverGroups)],
  };
}

function inferPrimaryGroup(position: string | null, tacticalRole: string | null, name: string): GroupKey | null {
  const primaryPart = getPrimaryPosition(position);
  const primaryGroup = primaryPart ? mapPositionToDepthGroup(primaryPart) : null;
  if (primaryGroup) return primaryGroup;

  const text = `${position ?? ""} ${tacticalRole ?? ""} ${name}`.toLowerCase();
  if (/goalkeeper|\bgk\b/.test(text)) return "gk";
  if (/centre back|central back|cb\b|high-line recovery defender|ball-playing right cb|left-sided utility defender|utility defender/.test(text)) return "cb";
  if (/right-back|right back|rb\b|right-sided defender|right full-back/.test(text)) return "rb";
  if (/left-back|left back|lb\b|left-sided defender|left full-back/.test(text)) return "lb";
  if (/pivot|six|build-up orchestrator|press-resistant pivot|control hub|dm\b|cm\b/.test(text)) return "mid";
  if (/franchise 10|between lines|attacking midfielder|cam\b|number 10|creator prospect/.test(text)) return "am";
  if (/winger|wide|left-sided|right-sided|finisher|wing\b|rw\b|lw\b|ss\/w|creator and finisher/.test(text)) return "wing";
  if (/striker|box reference point|forward|st\b|cf\b/.test(text)) return "st";

  const tokens = parsePositionParts(position);
  if (tokens.includes("GK")) return "gk";
  if (tokens.includes("CB")) return "cb";
  if (tokens.includes("RB")) return "rb";
  if (tokens.includes("LB")) return "lb";
  if (tokens.includes("DM") || tokens.includes("CM")) return "mid";
  if (tokens.includes("AM")) return "am";
  if (tokens.some((token) => token === "LW" || token === "RW" || token === "W")) return "wing";
  if (tokens.includes("ST") || tokens.includes("CF")) return "st";
  return null;
}

function genericCoverGroups(position: string | null, tacticalRole: string | null, name: string, primaryGroup: GroupKey | null): GroupKey[] {
  const text = `${position ?? ""} ${tacticalRole ?? ""} ${name}`.toLowerCase();
  const roleCandidates = new Set<GroupKey>();
  if (/(attacking midfielder|number 10|franchise 10|creator|second striker|\b10\b)/.test(text)) {
    roleCandidates.add("am");
  }
  if (/(wing|wide|left-sided|right-sided|wing backup|wide backup)/.test(text)) {
    roleCandidates.add("wing");
  }
  if (/(striker|forward|box|finisher|9)/.test(text)) {
    roleCandidates.add("st");
  }
  if (/(goalkeeper|keeper)/.test(text)) {
    roleCandidates.add("gk");
  }
  if (/(left-back|right-back|full-back|defender|centre back|center back|utility defender)/.test(text)) {
    roleCandidates.add("cb");
    roleCandidates.add("rb");
    roleCandidates.add("lb");
  }
  if (/(pivot|six|cm|dm|press-resistant|build-up|control hub)/.test(text)) {
    roleCandidates.add("mid");
  }

  for (const token of getCoverPositions(position)) {
    const group = mapPositionToDepthGroup(token);
    if (group) roleCandidates.add(group);
  }
  return [...roleCandidates].filter((group): group is GroupKey => Boolean(group) && group !== primaryGroup);
}

function nameOverride(name: string) {
  const overrides: Record<string, { primary: GroupKey | null; cover?: GroupKey[] }> = {
    "jonathan tah": { primary: "cb" },
    "dayot upamecano": { primary: "cb" },
    "minjae kim": { primary: "cb" },
    "min-jae kim": { primary: "cb" },
    "hiroki ito": { primary: "cb", cover: ["lb"] },
    "alphonso davies": { primary: "lb" },
    "josip stanisic": { primary: "rb", cover: ["cb", "lb"] },
    "konrad laimer": { primary: "rb", cover: ["mid"] },
    "joshua kimmich": { primary: "mid" },
    "aleksandar pavlovic": { primary: "mid" },
    "alexandar pavlovic": { primary: "mid" },
    "lennart karl": { primary: null, cover: ["am", "wing"] },
    "serge gnabry": { primary: null, cover: ["am", "wing"] },
    "jamal musiala": { primary: "am", cover: ["wing"] },
    "michael olise": { primary: "wing" },
    "luis diaz": { primary: "wing" },
    "harry kane": { primary: "st" },
    "tarek buchmann": { primary: null, cover: [] },
  };
  return overrides[name] ?? null;
}

function tokenToGroup(token: string): GroupKey | null {
  if (token === "GK" || token === "GOALKEEPER") return "gk";
  if (token === "RB" || token === "RWB") return "rb";
  if (token === "LB" || token === "LWB") return "lb";
  if (token === "CB" || token === "DEF") return "cb";
  if (token === "DM" || token === "CM" || token === "CDM" || token === "MID") return "mid";
  if (token === "AM" || token === "CAM" || token === "10") return "am";
  if (token === "LW" || token === "RW" || token === "W" || token === "WING" || token === "WINGER") return "wing";
  if (token === "ST" || token === "CF" || token === "FWD" || token === "STRIKER") return "st";
  return null;
}

function parsePositionParts(position: string | null | undefined) {
  return [...new Set((position ?? "")
    .replace(/\bcentre[- ]?back\b/gi, "CB")
    .replace(/\bcenter[- ]?back\b/gi, "CB")
    .replace(/\bright[- ]?back\b/gi, "RB")
    .replace(/\bleft[- ]?back\b/gi, "LB")
    .replace(/\battacking midfielder\b/gi, "AM")
    .replace(/\bdefensive midfielder\b/gi, "DM")
    .replace(/\bcentral midfielder\b/gi, "CM")
    .replace(/\bright winger\b/gi, "RW")
    .replace(/\bleft winger\b/gi, "LW")
    .replace(/\bwinger\b/gi, "W")
    .replace(/\bstriker\b/gi, "ST")
    .split(/[\/,|+]/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean))];
}

function getPrimaryPosition(position: string | null | undefined) {
  return parsePositionParts(position)[0] ?? null;
}

function getCoverPositions(position: string | null | undefined) {
  return parsePositionParts(position).slice(1);
}

function mapPositionToDepthGroup(positionPart: string): GroupKey | null {
  return tokenToGroup(positionPart.trim().toUpperCase());
}

function countsAsPrimary(kind: SimulationRosterEntry["kind"], importance: string | null, minutes: string | null, injuryRisk: number) {
  if (kind === "signing") return true;
  if (importance === "core" || importance === "starter") return true;
  if (importance === "rotation" && minutes === "starter") return true;
  if ((importance === "development" || minutes === "prospect") && injuryRisk >= 55) return false;
  return false;
}

function coverWeight(kind: SimulationRosterEntry["kind"], importance: string | null, minutes: string | null) {
  if (kind === "signing") return 0.75;
  if (importance === "starter" || importance === "core") return 0.75;
  if (importance === "rotation" || minutes === "rotation") return 0.55;
  if (importance === "sellable" || importance === "emergency_depth") return 0.4;
  if (importance === "development" || importance === "loan_candidate" || minutes === "prospect") return 0.25;
  return 0.35;
}

function getRosterTacticalRole(entry: SimulationRosterEntry, catalogMeta: CatalogPlayerMeta | null) {
  if (catalogMeta && typeof catalogMeta.tactical_role === "string") {
    return catalogMeta.tactical_role;
  }
  const raw = (entry.player as { raw_json?: unknown }).raw_json;
  if (raw && typeof raw === "object") {
    const tacticalRole = (raw as { tactical_role?: unknown }).tactical_role;
    if (typeof tacticalRole === "string" && tacticalRole.trim()) return tacticalRole;
  }
  return null;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
