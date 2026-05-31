import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SlotData = {
  slot: string;
  playerName?: string;
  position?: string;
  shirtNumber?: string | number;
};

function PitchPlayer({ slot, playerName, shirtNumber, position }: SlotData) {
  const filled = Boolean(playerName);

  return (
    <div
      className={cn(
        "relative flex min-h-[5.75rem] flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center transition-all sm:min-h-[6.25rem]",
        filled
          ? "border-white/20 bg-white/12 shadow-[0_6px_18px_rgba(0,0,0,0.18)] backdrop-blur-sm"
          : "border-dashed border-white/8 bg-white/4",
      )}
    >
      {shirtNumber && shirtNumber !== "N/A" ? (
        <span className="absolute right-2 top-1.5 text-[9px] font-bold text-white/40">#{shirtNumber}</span>
      ) : null}
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">{slot}</p>
      <p className="max-w-full truncate px-1 text-sm font-bold text-white">{playerName ?? "Unassigned"}</p>
      {position ? <p className="mt-0.5 text-[10px] text-white/45">{position}</p> : null}
    </div>
  );
}

export function PitchLineup({
  formation,
  slots,
  benchSlots = [],
}: {
  formation: string;
  slots: SlotData[];
  benchSlots?: SlotData[];
}) {
  const gk = slots.filter((slot) => slot.slot === "GK");
  const defense = slots.filter((slot) => /LB|LCB|CB|RCB|RB|LWB|RWB/.test(slot.slot));
  const midfield = slots.filter((slot) => /DM|CM|LM|RM/.test(slot.slot));
  const attackMid = slots.filter((slot) => /AM|LAM|RAM|IW/.test(slot.slot));
  const wingers = slots.filter((slot) => /LW|RW/.test(slot.slot));
  const strikers = slots.filter((slot) => /ST/.test(slot.slot));

  const rows = [strikers, wingers, attackMid, midfield, defense, gk].filter((row) => row.length > 0);
  const filledCount = slots.filter((slot) => Boolean(slot.playerName)).length;
  const totalSlots = slots.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Pitch Lineup</CardTitle>
            <CardDescription>
              {formation} - {filledCount}/{totalSlots} positions filled.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="gold">{formation}</Badge>
            <Badge tone={filledCount === totalSlots ? "success" : "warning"}>
              {filledCount === totalSlots ? "XI ready" : `${totalSlots - filledCount} open`}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="relative overflow-hidden rounded-[2rem] border border-emerald-900/25 bg-[linear-gradient(180deg,#15532e_0%,#1a6338_40%,#15532e_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_48px_rgba(15,23,42,0.2)]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.08]">
            <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" />
            <div className="absolute left-0 right-0 top-1/2 h-px bg-white" />
          </div>

          <div className="relative space-y-3">
            {rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className={cn(
                  "grid gap-2",
                  row.length === 1
                    ? "mx-auto max-w-[10rem] grid-cols-1"
                    : row.length === 2
                      ? "grid-cols-2"
                      : row.length === 3
                        ? "grid-cols-2 sm:grid-cols-3"
                        : row.length === 4
                          ? "grid-cols-2 sm:grid-cols-4"
                          : row.length === 5
                            ? "grid-cols-2 sm:grid-cols-5"
                            : "grid-cols-2 sm:grid-cols-3",
                )}
              >
                {row.map((slot) => (
                  <PitchPlayer
                    key={slot.slot}
                    slot={slot.slot}
                    playerName={slot.playerName}
                    position={slot.position}
                    shirtNumber={slot.shirtNumber}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {benchSlots.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Bench</p>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              {benchSlots.map((slot) => (
                <div key={slot.slot} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  {slot.shirtNumber && slot.shirtNumber !== "N/A" ? (
                    <span className="text-[10px] text-slate-400">#{slot.shirtNumber}</span>
                  ) : null}
                  <span className="text-sm font-semibold text-slate-900">{slot.playerName ?? "-"}</span>
                  {slot.position ? <span className="text-xs text-slate-500">({slot.position})</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
