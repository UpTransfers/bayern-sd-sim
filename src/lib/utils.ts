import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMillions(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Unavailable";
  }
  return `EUR ${value}M`;
}

export function formatCurrencyMillions(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Unavailable from free source";
  }
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value * 1_000_000);
}

export function formatTransferValueRange(min: number | null | undefined, max: number | null | undefined) {
  if (min === null || min === undefined || max === null || max === undefined) {
    return "Unavailable";
  }
  const format = (value: number) => `€${Number.isInteger(value) ? value : value.toFixed(1)}m`;
  if (min === max) {
    return format(min);
  }
  return `${format(min)}-${format(max)}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function roundToNearest(value: number, nearest = 1) {
  return Math.round(value / nearest) * nearest;
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function ordinal(value: number) {
  const suffix = ["th", "st", "nd", "rd"];
  const v = value % 100;
  return `${value}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`;
}

export function clampScore(value: number | null | undefined) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value ?? NaN) ? Number(value) : 0)));
}

export function formatSignedGoalDiff(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value > 0 ? "+" : ""}${value}`;
}

export function stableId(prefix: string, ...parts: Array<string | number | null | undefined>) {
  const raw = parts.filter(Boolean).join("|").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${prefix}-${raw || "item"}`;
}
