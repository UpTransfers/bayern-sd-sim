import { cn } from "@/lib/utils";

export function BayernBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-gradient-to-br from-[#b80d19] via-[#e11d48] to-[#7f0d1a] text-[10px] font-black uppercase tracking-[0.28em] text-white shadow-[0_18px_40px_rgba(184,13,25,0.38)]",
        className,
      )}
      aria-label="Bayern Sporting Office badge"
    >
      <span className="leading-none text-center">FCB</span>
    </div>
  );
}
