import { describe, expect, it } from "vitest";
import type { RunStatus } from "../../src/runStatus.ts";
import { searchRuns } from "./search.ts";

function run(repo: string, issue: number, fields: Partial<RunStatus> = {}): RunStatus {
  return {
    repo,
    issue,
    issueUrl: `https://github.com/${repo}/issues/${issue}`,
    title: null,
    branch: `mike/${issue}`,
    phase: "done",
    attempts: 1,
    costUsd: 0,
    model: null,
    thinkingLevel: null,
    prUrl: null,
    lastError: null,
    startedAt: null,
    updatedAt: null,
    ...fields,
  };
}

const keys = (runs: RunStatus[]) => runs.map((r) => `${r.repo}#${r.issue}`);

describe("searchRuns", () => {
  it("matches every token, each in any field", () => {
    const runs = [run("owner/web", 42, { title: "Fix login" }), run("owner/api", 42), run("owner/web", 7)];
    expect(keys(searchRuns(runs, "WEB 42"))).toEqual(["owner/web#42"]);
    expect(keys(searchRuns(runs, "web login"))).toEqual(["owner/web#42"]);
  });

  it("matches the issue number with a leading #", () => {
    const runs = [run("owner/web", 42), run("owner/web", 142), run("owner/web", 7)];
    expect(keys(searchRuns(runs, "#42"))).toEqual(["owner/web#42"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchRuns([run("owner/web", 1)], "   ")).toEqual([]);
  });

  it("puts live runs first, then the most recently updated", () => {
    const runs = [
      run("o/r", 1, { updatedAt: "2026-01-03T00:00:00Z" }),
      run("o/r", 2, { phase: "implement", updatedAt: "2026-01-01T00:00:00Z" }),
      run("o/r", 3, { updatedAt: "2026-01-02T00:00:00Z" }),
    ];
    expect(keys(searchRuns(runs, "o/r"))).toEqual(["o/r#2", "o/r#1", "o/r#3"]);
  });

  it("returns at most 8 runs", () => {
    const runs = Array.from({ length: 12 }, (_, i) => run("o/r", i + 1));
    expect(searchRuns(runs, "o/r")).toHaveLength(8);
  });
});
