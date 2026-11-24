import { Activity } from "@lucide/vue";
import { scaleOrdinal } from "@tanstack/charts/scales/ordinal";
import type { Component } from "vue";
import type { IssuePhase, RunStatus } from "../../src/runStatus.ts";
import { formatDuration } from "./format.ts";
import { isIdle, stepLook } from "./phase.ts";

export const RANGES = ["7d", "30d", "all"] as const;
export type MetricsRange = (typeof RANGES)[number];

const RANGE_DAYS: Record<MetricsRange, number | null> = { "7d": 7, "30d": 30, all: null };

export const RANGE_LABELS: Record<MetricsRange, string> = { "7d": "7 days", "30d": "30 days", all: "All time" };

const RANGE_LEAD: Record<MetricsRange, string> = {
  "7d": "In the last 7 days",
  "30d": "In the last 30 days",
  all: "So far",
};

export const OUTCOMES = ["working", "review", "merged", "closed", "failed", "aborted"] as const;
export type Outcome = (typeof OUTCOMES)[number];

const OUTCOME_LABELS: Record<Outcome, string> = {
  working: "Working",
  review: "In review",
  merged: "Merged",
  closed: "Closed",
  failed: "Failed",
  aborted: "Aborted",
};

export type RunCost = Pick<RunStatus, "repo" | "issue" | "title" | "costUsd"> & { outcome: Outcome };

export type Metrics = {
  range: MetricsRange;
  runs: number;
  prs: { opened: number; merged: number; closed: number };
  /** Merged share of the PRs that merged or closed. */
  mergeRate: number | null;
  cost: { total: number; medianPerMergedPr: number | null; p90PerMergedPr: number | null };
  /** Share of runs with a PR that passed their checks without a fix. */
  firstPassRate: number | null;
  fixAttemptsPerPr: number | null;
  medianRunMs: number | null;
  /** PRs waiting for review now, whatever the range. */
  inReview: { count: number; oldestSince: string | null };
  outcomes: { outcome: Outcome; count: number }[];
  /** Most expensive first. */
  costs: RunCost[];
  /** How long each finished run's pipeline took. */
  runTimes: { outcome: Outcome; ms: number }[];
  /** Run starts by local weekday (0 is Monday) and hour. */
  starts: { weekday: number; hour: number; count: number }[];
  failures: { reason: string; count: number }[];
  models: { model: string; runs: number; merged: number; medianCostUsd: number | null }[];
};

const MAX_FAILURE_REASONS = 5;
const MAX_REASON_CHARS = 120;

export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below);
}

const median = (values: readonly number[]) => quantile(values, 0.5);
const share = (part: number, whole: number) => (whole ? part / whole : null);

export const outcomeOf = (phase: IssuePhase): Outcome => (isIdle(phase) ? (phase as Outcome) : "working");

const reasonOf = (error: string | null) =>
  (error?.split("\n")[0]?.trim() || "No error recorded").slice(0, MAX_REASON_CHARS);

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
}

/** Metrics over the runs that started in `range`; the review queue counts every run. */
export function computeMetrics(all: readonly RunStatus[], range: MetricsRange, now: number): Metrics {
  const days = RANGE_DAYS[range];
  const from = days === null ? -Infinity : now - days * 86_400_000;
  const runs = all.filter((run) => run.startedAt && Date.parse(run.startedAt) >= from);

  const withPr = runs.filter((run) => run.prUrl);
  const merged = runs.filter((run) => run.prState === "merged");
  const closed = runs.filter((run) => run.prState === "closed");
  const mergedCosts = merged.map((run) => run.costUsd);
  const finished = runs.filter((run) => isIdle(run.phase) && run.updatedAt);
  const runTimes = finished.map((run) => ({
    outcome: outcomeOf(run.phase),
    ms: Date.parse(run.updatedAt!) - Date.parse(run.startedAt!),
  }));
  const reviewQueue = all.filter((run) => run.phase === "review");

  const starts = new Map<string, { weekday: number; hour: number; count: number }>();
  for (const run of runs) {
    const date = new Date(run.startedAt!);
    const weekday = (date.getDay() + 6) % 7;
    const key = `${weekday}:${date.getHours()}`;
    const cell = starts.get(key) ?? { weekday, hour: date.getHours(), count: 0 };
    cell.count++;
    starts.set(key, cell);
  }

  const outcomes = groupBy(runs, (run) => outcomeOf(run.phase));
  const failures = groupBy(
    runs.filter((run) => run.phase === "failed"),
    (run) => reasonOf(run.lastError),
  );

  return {
    range,
    runs: runs.length,
    prs: { opened: withPr.length, merged: merged.length, closed: closed.length },
    mergeRate: share(merged.length, merged.length + closed.length),
    cost: {
      total: runs.reduce((sum, run) => sum + run.costUsd, 0),
      medianPerMergedPr: median(mergedCosts),
      p90PerMergedPr: quantile(mergedCosts, 0.9),
    },
    firstPassRate: share(withPr.filter((run) => run.attempts === 0).length, withPr.length),
    fixAttemptsPerPr: withPr.length ? withPr.reduce((sum, run) => sum + run.attempts, 0) / withPr.length : null,
    medianRunMs: median(runTimes.map((time) => time.ms)),
    inReview: {
      count: reviewQueue.length,
      oldestSince:
        reviewQueue
          .map((run) => run.updatedAt)
          .filter((at) => at !== null)
          .sort()[0] ?? null,
    },
    outcomes: OUTCOMES.map((outcome) => ({ outcome, count: outcomes.get(outcome)?.length ?? 0 })),
    costs: runs
      .map(({ repo, issue, title, costUsd, phase }) => ({ repo, issue, title, costUsd, outcome: outcomeOf(phase) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    runTimes,
    starts: [...starts.values()],
    failures: [...failures]
      .map(([reason, items]) => ({ reason, count: items.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_FAILURE_REASONS),
    models: [...groupBy(runs, (run) => run.model ?? "Unknown")]
      .map(([model, items]) => ({
        model,
        runs: items.length,
        merged: items.filter((run) => run.prState === "merged").length,
        medianCostUsd: median(items.map((run) => run.costUsd)),
      }))
      .sort((a, b) => b.runs - a.runs),
  };
}

/** A theme color as a CSS value charts can paint with, from a `text-*` hue class. */
export const paintOf = (hue: string) => `var(--color-${hue.replace(/^text-/, "")})`;

// Closed and aborted share a hue elsewhere; charts need them apart.
const CHART_HUE: Partial<Record<Outcome, string>> = { aborted: "text-idle" };

export function outcomeLook(outcome: Outcome): { icon: Component; hue: string; label: string; paint: string } {
  const look = outcome === "working" ? { icon: Activity, hue: "text-run" } : stepLook[outcome];
  return { ...look, label: OUTCOME_LABELS[outcome], paint: paintOf(CHART_HUE[outcome] ?? look.hue) };
}

export const outcomeColor = scaleOrdinal<Outcome, string>()
  .domain(OUTCOMES)
  .range(OUTCOMES.map((outcome) => outcomeLook(outcome).paint));

export function formatShare(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

export type SentencePart = { text: string; figure?: true };

/** The page's summary as sentences whose figures are marked, so they can be set apart. */
export function summarize(metrics: Metrics, now: number): SentencePart[][] {
  const { runs, prs, inReview, range } = metrics;
  const figure = (value: number): SentencePart => ({ text: String(value), figure: true });
  const lead = RANGE_LEAD[range];
  const sentences: SentencePart[][] = [];

  if (runs === 0) sentences.push([{ text: `${lead}, mike didn't start any runs.` }]);
  else
    sentences.push([
      { text: `${lead}, mike started ` },
      figure(runs),
      { text: ` ${plural(runs, "run")} and opened ` },
      figure(prs.opened),
      { text: ` ${plural(prs.opened, "pull request")}.` },
    ]);

  const settled: SentencePart[] =
    prs.merged + prs.closed > 0
      ? [{ text: "You merged " }, figure(prs.merged), { text: " and closed " }, figure(prs.closed)]
      : [];
  const waiting: SentencePart[] = [];
  if (inReview.count > 0) {
    waiting.push({ text: settled.length ? ", and " : "There " }, figure(inReview.count), {
      text: ` ${plural(inReview.count, "is", "are")} waiting for your review`,
    });
    if (inReview.oldestSince)
      waiting.push({ text: `, the oldest for ${formatDuration(now - Date.parse(inReview.oldestSince))}` });
  }
  if (settled.length || waiting.length) sentences.push([...settled, ...waiting, { text: "." }]);
  return sentences;
}
