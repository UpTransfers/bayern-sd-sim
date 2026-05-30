"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TacticalSettings } from "@/lib/types";

const numericControls: Array<{
  key: keyof Pick<
    TacticalSettings,
    | "pressingIntensity"
    | "defensiveLineHeight"
    | "wingerWidth"
    | "buildUpSpeed"
    | "ballsInBehindRisk"
    | "counterpressingAggression"
    | "rotationLevel"
    | "strikerDropDeep"
    | "pivotSecurity"
  >;
  label: string;
  help: string;
}> = [
  { key: "pressingIntensity", label: "Pressing intensity", help: "Higher wins more balls but burns legs." },
  { key: "defensiveLineHeight", label: "Defensive line", help: "Higher compresses the pitch but exposes space." },
  { key: "wingerWidth", label: "Winger width", help: "Higher stretches defences and frees half-spaces." },
  { key: "buildUpSpeed", label: "Build-up speed", help: "Higher creates quicker attacks, but less security." },
  { key: "ballsInBehindRisk", label: "Balls in behind", help: "Higher creates more direct chances and more volatility." },
  { key: "counterpressingAggression", label: "Counterpressing", help: "Higher forces chaos right after losing the ball." },
  { key: "rotationLevel", label: "Rotation level", help: "Higher preserves energy, but can blunt chemistry." },
  { key: "strikerDropDeep", label: "Striker drop-deep", help: "Higher helps links between lines and restarts." },
  { key: "pivotSecurity", label: "Pivot security", help: "Higher gives the 6s more rest defence and control." },
];

export function TacticalControls({
  tactics,
  onChange,
  onReset,
  onSave,
  saveNotice,
}: {
  tactics: TacticalSettings;
  onChange: (next: TacticalSettings) => void;
  onReset: () => void;
  onSave: () => void;
  saveNotice?: string | null;
}) {
  return (
    <Card className="border-slate-200 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Kompany Tactics</CardTitle>
            <CardDescription>These controls change the tactical score, risk profile, and season projection.</CardDescription>
          </div>
          <Badge tone="gold">Editable</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {numericControls.map((control) => (
            <Field
              key={control.key}
              label={control.label}
              help={control.help}
              value={tactics[control.key]}
              onChange={(value) => onChange({ ...tactics, [control.key]: value })}
            />
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ToggleField
            label="Pressing mode"
            value={tactics.pressingMode}
            options={[
              { label: "Man-oriented", value: "man" },
              { label: "Zonal protection", value: "zonal" },
            ]}
            onChange={(value) => onChange({ ...tactics, pressingMode: value as TacticalSettings["pressingMode"] })}
          />
          <ToggleField
            label="Fullback role"
            value={tactics.fullbackRole}
            options={[
              { label: "Inverted", value: "inverted" },
              { label: "Balanced", value: "balanced" },
              { label: "Wide", value: "wide" },
            ]}
            onChange={(value) => onChange({ ...tactics, fullbackRole: value as TacticalSettings["fullbackRole"] })}
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <MiniStat label="Press load" value={tactics.pressingIntensity} tone="gold" />
          <MiniStat label="Line height" value={tactics.defensiveLineHeight} tone="gold" />
          <MiniStat label="Direct risk" value={tactics.ballsInBehindRisk} tone="warning" />
          <MiniStat label="Rotation" value={tactics.rotationLevel} tone="success" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onReset}>
            Reset tactics
          </Button>
          <Button onClick={onSave}>Save tactics</Button>
        </div>

        {saveNotice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {saveNotice}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="text-xs text-slate-500">{help}</p>
        </div>
        <Badge tone="muted">{value}</Badge>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-[#b80d19]"
      />
    </div>
  );
}

function ToggleField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-950">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <Button key={option.value} size="sm" variant={value === option.value ? "default" : "outline"} onClick={() => onChange(option.value)}>
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "gold" | "success" | "warning" }) {
  return (
    <div className="rounded-xl border border-white bg-white p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
      <Badge tone={tone} className="mt-2">
        {tone === "warning" ? "Risk" : tone === "success" ? "Control" : "Balance"}
      </Badge>
    </div>
  );
}
