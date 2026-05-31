import { cn } from "@/lib/utils";

type Variant = "default" | "large" | "small" | "flat";

const variantStyles: Record<Variant, string> = {
  default: "h-12 w-12 text-[10px]",
  large: "h-20 w-20 text-[13px] shadow-[0_24px_56px_rgba(184,13,25,0.5)]",
  small: "h-8 w-8 text-[8px] shadow-[0_8px_20px_rgba(184,13,25,0.28)]",
  flat: "h-10 w-10 text-[9px] shadow-none border-[#b80d19]/30",
};

export function BayernBadge({
  className,
  variant = "default",
  showStars = false,
}: {
  className?: string;
  variant?: Variant;
  showStars?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full border border-white/25 bg-gradient-to-br from-[#b80d19] via-[#e11d48] to-[#7f0d1a] font-black uppercase tracking-[0.28em] text-white shadow-[0_18px_40px_rgba(184,13,25,0.38)] transition-transform duration-200 hover:scale-105",
        variantStyles[variant],
        className,
      )}
      aria-label="Bayern Sporting Office badge"
    >
      {showStars && variant === "large" ? (
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] text-amber-300" aria-hidden>
          *
        </span>
      ) : null}
      <span className="select-none text-center leading-none">FCB</span>
      <span className="pointer-events-none absolute inset-[3px] rounded-full border border-white/10" aria-hidden />
    </div>
  );
}
