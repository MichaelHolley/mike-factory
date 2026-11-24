import { describe, expect, it } from "vitest";
import type { RunStatus } from "../../src/runStatus.ts";
import { filterFinished, type FinishedFilter } from "./finished.ts";

function run(repo: string, issue: number, fields: Partial<RunStatus> = {}): RunStatus {
  return {
    repo,
    issue,
    issueUrl: `https://github.com/${repo}/issues/${issue}`,
    title: null,
    branch: `mike/${issue}`,
    phase: "failed",
    attempts: 1,
    costUsd: 0,
    model: null,
    thinkingLevel: null,
    prUrl: null,
    prState: null,
    lastError: null,
    startedAt: "2026-11-10T12:00:00",
    updatedAt: "2026-11-10T13:00:00",
    ...fields,
  };
}

const none: FinishedFilter = { repo: null, outcome: null, started: null };
const keys = (runs: RunStatus[]) => runs.map((r) => `${r.repo}#${r.issue}`);

describe("filterFinished", () => {
  it("keeps only finished runs, newest finish first across repos", () => {
    const runs = [
      run("o/a", 1, { updatedAt: "2026-11-10T10:00:00" }),
      run("o/b", 2, { updatedAt: "2026-11-12T10:00:00" }),
      run("o/a", 3, { phase: "implement", updatedAt: "2026-11-13T10:00:00" }),
      run("o/a", 4, { phase: "failed", updatedAt: "2026-11-11T10:00:00" }),
    ];
    expect(keys(filterFinished(runs, none))).toEqual(["o/b#2", "o/a#4", "o/a#1"]);
  });

  it("filters by repo", () => {
    const runs = [run("o/a", 1), run("o/b", 2)];
    expect(keys(filterFinished(runs, { ...none, repo: "o/b" }))).toEqual(["o/b#2"]);
  });

  it("filters by outcome and leaves out runs in review", () => {
    const runs = [run("o/a", 1, { phase: "merged" }), run("o/a", 2), run("o/a", 3, { phase: "review" })];
    expect(keys(filterFinished(runs, { ...none, outcome: "merged" }))).toEqual(["o/a#1"]);
    expect(keys(filterFinished(runs, none)).sort()).toEqual(["o/a#1", "o/a#2"]);
  });

  it("filters by local start day, inclusive on both ends, dropping runs that never started", () => {
    const runs = [
      run("o/a", 1, { startedAt: "2026-11-09T23:59:00" }),
      run("o/a", 2, { startedAt: "2026-11-10T00:00:00" }),
      run("o/a", 3, { startedAt: "2026-11-12T23:59:00" }),
      run("o/a", 4, { startedAt: "2026-11-13T00:00:00" }),
      run("o/a", 5, { startedAt: null }),
    ];
    const started: [string, string] = ["2026-11-10", "2026-11-12"];
    expect(keys(filterFinished(runs, { ...none, started })).sort()).toEqual(["o/a#2", "o/a#3"]);
  });
});
