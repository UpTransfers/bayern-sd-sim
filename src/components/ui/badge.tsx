import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "success" | "warning" | "muted" | "gold";
};

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase",
        tone === "default" && "bg-white/14 text-white border border-white/20",
        tone === "success" && "bg-emerald-500/15 text-emerald-700 border border-emerald-500/20",
        tone === "warning" && "bg-amber-500/15 text-amber-700 border border-amber-500/20",
        tone === "muted" && "bg-slate-500/10 text-slate-600 border border-slate-400/15",
        tone === "gold" && "bg-[#d4af37]/15 text-[#8a6d11] border border-[#d4af37]/30",
        className,
      )}
      {...props}
    />
  );
}
