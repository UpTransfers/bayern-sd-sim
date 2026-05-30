import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  tone = "neutral",
}: {
  value: number;
  className?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill =
    tone === "positive"
      ? clamped >= 70
        ? "from-emerald-500 to-emerald-300"
        : clamped >= 45
          ? "from-amber-400 to-yellow-300"
          : "from-red-500 to-red-300"
      : tone === "negative"
        ? clamped >= 70
          ? "from-red-500 to-red-300"
          : clamped >= 45
            ? "from-amber-400 to-yellow-300"
            : "from-emerald-500 to-emerald-300"
        : "from-[#b80d19] to-[#d4af37]";
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-slate-200/90", className)}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-300", fill)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
