import { describe, expect, it } from "vitest";
import type { RunStatus } from "../../src/runStatus.ts";
import { computeMetrics, quantile } from "./metrics.ts";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const DAY = 86_400_000;
const MINUTE = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function run(issue: number, fields: Partial<RunStatus> = {}): RunStatus {
  return {
    repo: "app",
    issue,
    issueUrl: `https://github.com/app/issues/${issue}`,
    title: null,
    branch: `mike/${issue}`,
    phase: "done",
    attempts: 0,
    costUsd: 1,
    model: "sol",
    thinkingLevel: null,
    prUrl: null,
    prState: null,
    lastError: null,
    startedAt: ago(DAY),
    updatedAt: ago(DAY - 30 * MINUTE),
    ...fields,
  };
}

const pr = (issue: number, prState: RunStatus["prState"], fields: Partial<RunStatus> = {}) =>
  run(issue, { phase: prState === "open" ? "review" : (prState ?? "done"), prState, prUrl: `pr/${issue}`, ...fields });

describe("quantile", () => {
  it("interpolates between the nearest values", () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 0.9)).toBe(10);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe("computeMetrics", () => {
  it("counts only runs started in the range, but every run waiting for review", () => {
    const runs = [
      run(1, { startedAt: ago(40 * DAY) }),
      run(2, { startedAt: ago(10 * DAY) }),
      run(3),
      run(4, { phase: "queued", startedAt: null }),
      pr(5, "open", { startedAt: ago(20 * DAY), updatedAt: ago(19 * DAY) }),
    ];

    expect(computeMetrics(runs, "7d", NOW)).toMatchObject({
      runs: 1,
      inReview: { count: 1, oldestSince: ago(19 * DAY) },
    });
    expect(computeMetrics(runs, "30d", NOW).runs).toBe(3);
    expect(computeMetrics(runs, "all", NOW).runs).toBe(4);
  });

  it("measures merges, cost per merged PR and first-try checks", () => {
    const runs = [
      pr(1, "merged", { costUsd: 1 }),
      pr(2, "merged", { costUsd: 3, attempts: 2 }),
      pr(3, "closed", { costUsd: 2 }),
      pr(4, "open", { costUsd: 4 }),
      run(5, { phase: "failed", costUsd: 10 }),
    ];

    expect(computeMetrics(runs, "all", NOW)).toMatchObject({
      prs: { opened: 4, merged: 2, closed: 1 },
      mergeRate: 2 / 3,
      cost: { total: 20, medianPerMergedPr: 2, p90PerMergedPr: 2.8 },
      firstPassRate: 0.75,
      fixAttemptsPerPr: 0.5,
    });
  });

  it("times finished runs from start to last update and skips live ones", () => {
    const runs = [
      run(1, { phase: "failed", updatedAt: ago(DAY - 10 * MINUTE) }),
      pr(2, "merged", { updatedAt: ago(DAY - 20 * MINUTE) }),
      run(3, { phase: "implement" }),
    ];

    const metrics = computeMetrics(runs, "all", NOW);
    expect(metrics.runTimes).toEqual([
      { outcome: "failed", ms: 10 * MINUTE },
      { outcome: "merged", ms: 20 * MINUTE },
    ]);
    expect(metrics.medianRunMs).toBe(15 * MINUTE);
  });

  it("groups failures by their error's first line and runs by model", () => {
    const runs = [
      run(1, { phase: "failed", lastError: "verify failed 3 times\noutput" }),
      run(2, { phase: "failed", lastError: "verify failed 3 times\nother output" }),
      run(3, { phase: "failed", lastError: null, model: null }),
      pr(4, "merged", { costUsd: 5 }),
    ];

    const metrics = computeMetrics(runs, "all", NOW);
    expect(metrics.failures).toEqual([
      { reason: "verify failed 3 times", count: 2 },
      { reason: "No error recorded", count: 1 },
    ]);
    expect(metrics.models).toEqual([
      { model: "sol", runs: 3, merged: 1, medianCostUsd: 1 },
      { model: "Unknown", runs: 1, merged: 0, medianCostUsd: 1 },
    ]);
  });
});
