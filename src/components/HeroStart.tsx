"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldCheck, LineChart, BadgeCheck, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ReactNode } from "react";

const budgets = [0, 50, 100, 150, 200, 300];

export function HeroStart({ dataMode }: { dataMode: string }) {
  const router = useRouter();
  const [directorName, setDirectorName] = useState("");
  const [budget, setBudget] = useState(200);
  const [loading, setLoading] = useState(false);
  const canSubmit = directorName.trim().length > 1;

  async function startSimulation() {
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directorName: directorName.trim(),
          budget,
          seasonLabel: "2026-27 Planning",
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to create simulation");
      }
      const payload = (await response.json()) as { id: string };
      router.push(`/dashboard/${payload.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(184,13,25,0.85),transparent_42%),linear-gradient(135deg,#6b0b12,#b80d19_45%,#101828_100%)] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-6xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-5xl"
        >
          <Card>
            <CardContent className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="gold">Bayern mode</Badge>
                  <Badge tone="muted" className="text-slate-700">
                    Free data plus transparent estimates
                  </Badge>
                  <Badge tone="muted" className="text-slate-700">
                    {dataMode}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <h1 className="max-w-xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                    FC Bayern Sporting Director Simulator
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-slate-700">
                    Build a Bayern squad plan, set the budget, open transfer talks, and take the season into your own hands.
                  </p>
                </div>

                <div className="grid gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Sporting Director Name</label>
                    <Input
                      value={directorName}
                      onChange={(event) => setDirectorName(event.target.value)}
                      placeholder="Enter your name"
                      autoComplete="name"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-slate-800">Budget in EUR millions</label>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {budgets.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setBudget(value)}
                          className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                            budget === value
                              ? "border-[#b80d19] bg-[#b80d19] text-white shadow-[0_12px_28px_rgba(184,13,25,0.28)]"
                              : "border-slate-200 bg-white text-slate-700 hover:border-[#b80d19]/40"
                          }`}
                        >
                          {value}M
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_8rem] sm:items-center">
                      <input
                        type="range"
                        min={0}
                        max={500}
                        step={5}
                        value={budget}
                        onChange={(event) => setBudget(Number(event.target.value))}
                        className="accent-[#b80d19]"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={500}
                        value={budget}
                        onChange={(event) => setBudget(Math.max(0, Math.min(500, Number(event.target.value) || 0)))}
                        aria-label="Budget in millions of euros"
                      />
                    </div>
                  </div>

                  <Button size="lg" onClick={startSimulation} disabled={!canSubmit || loading} className="w-full sm:w-auto">
                    {loading ? "Opening the boardroom..." : "Enter the boardroom"}
                    {!loading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                  </Button>
                </div>

                <p className="text-xs leading-6 text-slate-500">
                  Fan-made simulator. No official affiliation with FC Bayern Munich AG.
                </p>
              </div>

              <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#b80d19] text-white shadow-[0_14px_32px_rgba(184,13,25,0.28)]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">What the simulator controls</p>
                    <p className="text-sm text-slate-600">Transfers, tactics, squad pressure, and season variance.</p>
                  </div>
                </div>

                <InfoCard icon={<LineChart className="h-4 w-4" />} title="Weighted realism">
                  Bayern-specific transfer logic, wage caution, and tactical fit shape the run.
                </InfoCard>
                <InfoCard icon={<BadgeCheck className="h-4 w-4" />} title="Season report">
                  A full league table, Pokal and Champions League path, plus player awards.
                </InfoCard>
                <InfoCard icon={<ShieldCheck className="h-4 w-4" />} title="Transparent estimates">
                  Free data and editable assumptions keep the model clear, not opaque.
                </InfoCard>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

function InfoCard({ icon, title, children }: { icon: ReactNode; title: string; children: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#b80d19]/10 text-[#b80d19]">{icon}</div>
        <p className="font-semibold text-slate-950">{title}</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{children}</p>
    </div>
  );
}
