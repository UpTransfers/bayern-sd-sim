import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrencyMillions } from "@/lib/utils";

export function FinancialSummary({
  startingBudget,
  remainingBudget,
  transferSpend,
  transferIncome,
}: {
  startingBudget: number;
  remainingBudget: number;
  transferSpend: number;
  transferIncome: number;
}) {
  const netSpend = transferSpend - transferIncome;
  const grade = remainingBudget >= startingBudget * 0.5 ? "A" : remainingBudget >= startingBudget * 0.25 ? "B" : "C";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Summary</CardTitle>
        <CardDescription>Budget control and transfer balance.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <Metric label="Starting" value={formatCurrencyMillions(startingBudget)} />
        <Metric label="Remaining" value={formatCurrencyMillions(remainingBudget)} />
        <Metric label="Income" value={formatCurrencyMillions(transferIncome)} />
        <Metric label="Spend" value={formatCurrencyMillions(transferSpend)} />
        <Metric label="Net spend" value={formatCurrencyMillions(netSpend)} />
        <Metric label="Budget grade" value={grade} />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
