import type { RunStatus } from "../../src/runStatus.ts";

export function formatModel(run: Pick<RunStatus, "model" | "thinkingLevel">): string {
  if (!run.model) return "-";
  return run.thinkingLevel ? `${run.model} · ${run.thinkingLevel}` : run.model;
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "-";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Clock time, with the date only when it isn't today and the year only when it isn't this year. */
export function formatTime(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  const today = new Date(now);
  const sameYear = date.getFullYear() === today.getFullYear();
  const sameDay = sameYear && date.toDateString() === today.toDateString();
  return date.toLocaleString(undefined, {
    year: sameYear ? undefined : "numeric",
    month: sameDay ? undefined : "short",
    day: sameDay ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return `${Math.floor(Math.max(0, ms) / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return hours % 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${Math.floor(hours / 24)}d`;
}
