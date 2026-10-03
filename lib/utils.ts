import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Accepts "41:00", "2460" (seconds) or "2460s". */
export function parseTime(t: string | undefined | null): number | null {
  if (!t) return null;
  const mmss = t.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return (Number(mmss[1]) * 60 + Number(mmss[2])) * 1000;
  const secs = t.match(/^(\d+)s?$/);
  return secs ? Number(secs[1]) * 1000 : null;
}
