import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-2xl border border-white/60 bg-white/90 px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-[#b80d19] focus:ring-2 focus:ring-[#b80d19]/20",
        className,
      )}
      {...props}
    />
  );
}
