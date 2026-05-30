import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md" | "lg";
};

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-9 px-4 text-sm",
        size === "md" && "h-11 px-5 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variant === "default" &&
          "bg-gradient-to-r from-[#b80d19] via-[#e11d48] to-[#8d0810] text-white shadow-[0_16px_32px_rgba(184,13,25,0.35)] hover:brightness-110",
        variant === "secondary" &&
          "bg-slate-100 text-slate-950 border border-slate-200 hover:bg-white shadow-sm",
        variant === "ghost" &&
          "bg-transparent text-inherit hover:bg-slate-100/70",
        variant === "outline" &&
          "border border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
        variant === "destructive" &&
          "bg-[#7f0d1a] text-white hover:bg-[#94111f]",
        className,
      )}
      {...props}
    />
  );
}
