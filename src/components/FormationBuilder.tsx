import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formationOptions, formationSlots, type FormationKey } from "@/lib/simulation/formations";
import { formatTransferValueRange } from "@/lib/utils";
import type { SetPieceSettings, SimulationRosterEntry, TacticalSettings } from "@/lib/types";
import { TacticalControls } from "@/components/TacticalControls";
import { deriveRosterEntryProfile } from "@/lib/football/playerModel";
import { PitchLineup } from "@/components/PitchLineup";

type LineupSlot = { slot: string; playerId: string };

type RosterOption = {
  id: string;
  playerName: string;
  position: string;
  shirtNumber: string | number;
  transferValue: string;
  rating: number;
  form: number;
  sourceKind: "catalog" | "signing";
};

type Group = {
  label: string;
  pattern: RegExp;
  description: string;
};

const coverageGroups: Group[] = [
  { label: "Goalkeepers", pattern: /GK/i, description: "No. 1 pathway and emergency depth." },
  { label: "Defenders", pattern: /CB|LB|RB|WB|DEF/i, description: "High-line cover and recovery pace." },
  { label: "Midfielders", pattern: /DM|CM|AM|MID/i, description: "Press resistance and rest defence." },
  { label: "Attackers", pattern: /LW|RW|ST|FWD|ATT/i, description: "Chance creation and box threat." },
];

const coveragePriority = ["GK", "DEF", "MID", "ATT"] as const;

export function FormationBuilder({
  formation,
  roster,
  lineup,
  tactics,
  onChangeFormation,
  onChangeSlot,
  onAutoPick,
  onReset,
  onSave,
  onTacticsChange,
  onSaveTactics,
  onResetTactics,
  setPieces,
  onSetPiecesChange,
  onSaveSetPieces,
  saveNotice,
  tacticsNotice,
  setPiecesNotice,
}: {
  formation: FormationKey;
  roster: SimulationRosterEntry[];
  lineup: LineupSlot[];
  tactics: TacticalSettings;
  onChangeFormation: (value: FormationKey) => void;
  onChangeSlot: (slot: string, playerId: string) => void;
  onAutoPick: () => void;
  onReset: () => void;
  onSave: () => void;
  onTacticsChange: (next: TacticalSettings) => void;
  onSaveTactics: () => void;
  onResetTactics: () => void;
  setPieces: SetPieceSettings;
  onSetPiecesChange: (next: SetPieceSettings) => void;
  onSaveSetPieces: () => void;
  saveNotice?: string | null;
  tacticsNotice?: string | null;
  setPiecesNotice?: string | null;
}) {
  const slots = formationSlots(formation);
  const rosterOptions = useMemo<RosterOption[]>(
    () =>
      roster.map((entry) => {
        const profile = deriveRosterEntryProfile(entry);
        const playerName = entry.player.name;
        const shirtNumber = entry.kind === "catalog" ? entry.player.shirt_number : null;
        const transferValue =
          entry.kind === "catalog"
            ? formatTransferValueRange(entry.player.transfer_value_min_eur_m ?? null, entry.player.transfer_value_max_eur_m ?? null)
            : "Signed";

        return {
          id: entry.id,
          playerName,
          position: entry.player.position ?? "Unknown",
          shirtNumber: shirtNumber ?? "N/A",
          transferValue,
          rating: profile.rating,
          form: profile.form,
          sourceKind: entry.kind,
        };
      }),
    [roster],
  );

  const selectedIds = new Set(lineup.map((item) => item.playerId));
  const selectedLookup = new Map(lineup.map((item) => [item.slot, item.playerId]));
  const starterOptions = rosterOptions.filter((player) => selectedIds.has(player.id));
  const missing = slots.filter((slot) => !lineup.some((item) => item.slot === slot && item.playerId));
  const selectedCount = slots.length - missing.length;
  const starters = slots.map((slot) => {
    const selectedId = selectedLookup.get(slot) ?? "";
    const meta = rosterOptions.find((item) => item.id === selectedId);
    return { slot, meta };
  });
  const pitchSlots = starters.map((item) => ({
    slot: item.slot,
    playerName: item.meta?.playerName,
    position: item.meta?.position,
    shirtNumber: item.meta?.shirtNumber,
  }));

  const depthGroups = useMemo(
    () =>
      coverageGroups.map((group) => {
        const allPlayers = rosterOptions
          .filter((item) => classifyCoverageGroup(item.position) === group.label)
          .sort((a, b) => b.rating - a.rating || b.form - a.form);
        return {
          ...group,
          count: allPlayers.length,
          players: allPlayers.slice(0, 4),
        };
      }),
    [rosterOptions],
  );

  const tacticalBalance = Math.round((tactics.pivotSecurity + tactics.rotationLevel + (100 - tactics.ballsInBehindRisk)) / 3);
  const rotationRisk = Math.max(0, 100 - Math.round((selectedCount / 11) * 55 + depthGroups.length * 4 + tactics.rotationLevel * 0.3));
  const benchPool = rosterOptions
    .filter((player) => !selectedIds.has(player.id))
    .sort((a, b) => b.rating - a.rating || b.form - a.form)
    .slice(0, 4);
  const benchSlots = benchPool.map((player) => ({
    slot: player.id,
    playerName: player.playerName,
    position: player.position,
    shirtNumber: player.shirtNumber,
  }));
  const benchQuality = benchPool.length ? Math.round(benchPool.reduce((sum, player) => sum + player.rating * 0.65 + player.form * 0.35, 0) / benchPool.length) : 0;

  return (
    <Card className="overflow-hidden border-slate-200 bg-white/97 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardHeader className="space-y-2 border-b border-slate-200/80 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl">Set Formation</CardTitle>
            <CardDescription>Choose the XI, shape, and tactical style in one clean view.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="gold">{formation}</Badge>
            <Badge tone={missing.length ? "warning" : "success"}>{missing.length ? `${missing.length} open` : "XI complete"}</Badge>
            <Badge tone="muted">{selectedCount}/11 selected</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-5">
        <div className="flex flex-wrap gap-2">
          {formationOptions.map((option) => (
            <Button key={option} variant={formation === option ? "default" : "outline"} size="sm" onClick={() => onChangeFormation(option)}>
              {option}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <SummaryChip label="Selected" value={`${selectedCount}/11`} />
          <SummaryChip label="Coverage" value={`${depthGroups.filter((group) => group.count > 0).length}/4 groups`} />
          <SummaryChip label="Rotation risk" value={`${rotationRisk}/100`} tone={rotationRisk > 55 ? "warning" : "success"} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <PitchLineup formation={formation} slots={pitchSlots} benchSlots={benchSlots} />

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Squad depth</p>
                  <p className="mt-1 text-sm text-slate-600">No fixed bench. Coverage is grouped by role and first reserve quality.</p>
                </div>
                <Badge tone="muted">{depthGroups.filter((group) => group.count > 0).length}/4</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {depthGroups.map((group) => (
                  <div key={group.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{group.label}</p>
                        <p className="text-xs text-slate-500">{group.description}</p>
                      </div>
                      <Badge tone={group.count ? "success" : "warning"}>{group.count} players</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.players.length ? (
                        group.players.map((player) => (
                          <Badge key={player.id} tone="muted" className="normal-case tracking-normal">
                            {player.playerName} #{player.shirtNumber}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">No natural cover in this role group.</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <TacticalControls
              tactics={tactics}
              onChange={onTacticsChange}
              onReset={onResetTactics}
              onSave={onSaveTactics}
              saveNotice={tacticsNotice}
            />

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Set pieces & leadership</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Captaincy and dead-ball roles unlock once the starting XI is complete, so the hierarchy reflects the actual team on the pitch.
                  </p>
                </div>
                <Badge tone={missing.length ? "warning" : "gold"}>{missing.length ? "Finish XI first" : "Match edge"}</Badge>
              </div>
              {missing.length ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  Set-piece roles will appear after the XI is filled. This keeps the captain and takers tied to the real starting lineup.
                </div>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <RoleSelect
                      label="Captain"
                      value={setPieces.captainId ?? ""}
                      players={starterOptions}
                      onChange={(captainId) => onSetPiecesChange({ ...setPieces, captainId })}
                    />
                    <RoleSelect
                      label="Penalty taker"
                      value={setPieces.penaltyTakerId ?? ""}
                      players={starterOptions}
                      onChange={(penaltyTakerId) => onSetPiecesChange({ ...setPieces, penaltyTakerId })}
                    />
                    <RoleSelect
                      label="Free-kick taker"
                      value={setPieces.freeKickTakerId ?? ""}
                      players={starterOptions}
                      onChange={(freeKickTakerId) => onSetPiecesChange({ ...setPieces, freeKickTakerId })}
                    />
                    <RoleSelect
                      label="Corner taker"
                      value={setPieces.cornerTakerId ?? ""}
                      players={starterOptions}
                      onChange={(cornerTakerId) => onSetPiecesChange({ ...setPieces, cornerTakerId })}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => onSetPiecesChange(defaultSetPieces())}>
                      Auto roles
                    </Button>
                    <Button onClick={onSaveSetPieces}>Save set pieces</Button>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leadership summary</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Captaincy and dead-ball roles are saved from the XI and then used inside the match model.
                    </p>
                  </div>
                  {setPiecesNotice ? (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                      {setPiecesNotice}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Validation</p>
                  <p className="mt-1 text-sm text-slate-600">Each slot renders one player only, so the pitch stays readable.</p>
                </div>
                <Badge tone={missing.length ? "warning" : "success"}>{missing.length ? "Incomplete" : "Ready"}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {missing.length ? missing.map((slot) => <Badge key={slot} tone="warning">{slot} empty</Badge>) : <Badge tone="success">All slots filled</Badge>}
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                Tactical balance: <span className="font-semibold text-slate-950">{tacticalBalance}/100</span> | Rotation risk:{" "}
                <span className="font-semibold text-slate-950">{rotationRisk}/100</span>
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Bench impact</p>
                    <p className="mt-1 text-sm text-slate-600">Best reserve quality and rotation leverage.</p>
                  </div>
                  <Badge tone={benchQuality >= 80 ? "success" : benchQuality >= 70 ? "gold" : "warning"}>{benchQuality}/100</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {benchPool.length ? (
                    benchPool.map((player) => (
                      <Badge key={player.id} tone="muted" className="normal-case tracking-normal">
                        {player.playerName} #{player.shirtNumber}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">No reserve impact available.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onAutoPick}>
                Auto-pick
              </Button>
              <Button variant="outline" onClick={onReset}>
                Reset XI
              </Button>
              <Button onClick={onSave}>Save formation</Button>
            </div>
            {saveNotice ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {saveNotice}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selection grid</p>
              <p className="mt-1 text-sm text-slate-600">Pick one player per slot. The row shows the essentials only.</p>
            </div>
            <Badge tone="muted">{rosterOptions.length} available</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {slots.map((slot) => {
              const current = lineup.find((item) => item.slot === slot)?.playerId ?? "";
              const currentMeta = rosterOptions.find((item) => item.id === current);
              return (
                <div key={slot} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[6rem_1fr_15rem] xl:items-center">
                  <div className="flex items-center gap-2">
                    <Badge tone={current ? "success" : "warning"}>{slot}</Badge>
                    <span className="text-xs text-slate-500">{current ? "Set" : "Open"}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{currentMeta?.playerName ?? "No player selected"}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {currentMeta ? `#${currentMeta.shirtNumber} | ${currentMeta.position} | ${describeSlot(slot)}` : "Select a player for this slot"}
                    </p>
                    {currentMeta ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge tone="muted">{currentMeta.transferValue}</Badge>
                      </div>
                    ) : null}
                  </div>
                  <select
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
                    value={current}
                    onChange={(event) => onChangeSlot(slot, event.target.value)}
                  >
                    <option value="">Choose player</option>
                    {rosterOptions.map((option) => (
                      <option key={option.id} value={option.id} disabled={selectedIds.has(option.id) && current !== option.id}>
                        {option.playerName} | #{option.shirtNumber} | {option.position} | {option.transferValue}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function classifyCoverageGroup(position: string) {
  const value = position.toUpperCase();
  const primaryToken = value.split("/")[0]?.trim() ?? value.trim();
  for (const group of coveragePriority) {
    if (group === "GK" && /GK/.test(primaryToken)) return "Goalkeepers";
    if (group === "DEF" && /CB|LB|RB|WB|DEF/.test(primaryToken)) return "Defenders";
    if (group === "MID" && /DM|CM|AM|MID/.test(primaryToken)) return "Midfielders";
    if (group === "ATT" && /LW|RW|ST|FWD|ATT/.test(primaryToken)) return "Attackers";
  }
  if (/GK/.test(value)) return "Goalkeepers";
  if (/CB|LB|RB|WB|DEF/.test(value)) return "Defenders";
  if (/DM|CM|AM|MID/.test(value)) return "Midfielders";
  if (/LW|RW|ST|FWD|ATT/.test(value)) return "Attackers";
  return "Midfielders";
}

function describeSlot(slot: string) {
  if (slot === "GK") return "Sweeper";
  if (slot === "LB" || slot === "LWB") return "Width or inverted";
  if (slot === "RB" || slot === "RWB") return "Width or inverted";
  if (slot.includes("CB")) return "Build-up";
  if (slot === "DM" || slot.includes("DM")) return "Security";
  if (slot === "AM" || slot.includes("AM")) return "Between lines";
  if (slot === "LW" || slot === "RW") return "Width / isolation";
  if (slot.includes("ST")) return "Box / drop-deep";
  return "Role";
}

function RoleSelect({
  label,
  value,
  players,
  onChange,
}: {
  label: string;
  value: string;
  players: RosterOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select
        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Auto-select</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.playerName} | #{player.shirtNumber} | {player.position}
          </option>
        ))}
      </select>
    </label>
  );
}

function defaultSetPieces(): SetPieceSettings {
  return {
    captainId: null,
    penaltyTakerId: null,
    freeKickTakerId: null,
    cornerTakerId: null,
  };
}

function SummaryChip({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "warning" | "success" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-950">{value}</span>
        <Badge tone={tone}>{tone === "success" ? "Ready" : tone === "warning" ? "Check" : "Info"}</Badge>
      </div>
    </div>
  );
}
