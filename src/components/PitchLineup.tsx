import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PitchLineup({
  formation,
  slots,
}: {
  formation: string;
  slots: Array<{ slot: string; playerName?: string }>;
}) {
  const rows: string[][] = [
    ["GK"],
    slots.filter((item) => /LB|LCB|CB|RCB|RB/.test(item.slot)).map((item) => item.slot),
    slots.filter((item) => /DM|CM|LM|RM|AM|LW|RW|LAM|RAM/.test(item.slot)).map((item) => item.slot),
    slots.filter((item) => /ST/.test(item.slot)).map((item) => item.slot),
  ].filter((row) => row.length > 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Pitch Lineup</CardTitle>
            <CardDescription>{formation} with your selected XI.</CardDescription>
          </div>
          <Badge tone="gold">Formation</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-[2rem] border border-[#f2c6cb] bg-[radial-gradient(circle_at_top,_rgba(184,13,25,0.16),_rgba(10,15,30,0.95))] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
          <div className="space-y-4">
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} className={cn("grid gap-3", row.length === 1 ? "grid-cols-1" : row.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                {row.map((slot) => {
                  const match = slots.find((item) => item.slot === slot);
                  return (
                    <div
                      key={slot}
                      className="rounded-2xl border border-white/12 bg-white/8 px-3 py-4 text-center backdrop-blur-sm"
                    >
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/65">{slot}</p>
                      <p className="mt-2 text-sm font-semibold">{match?.playerName ?? "Unassigned"}</p>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
