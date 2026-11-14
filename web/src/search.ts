import type { RunStatus } from "../../src/runStatus.ts";
import { isFinished } from "./phase.ts";

/** Runs matching every whitespace-separated token in their repo, title or `#issue`, live first, then newest. */
export function searchRuns(runs: readonly RunStatus[], query: string, limit = 8): RunStatus[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const updated = (run: RunStatus) => (run.updatedAt ? Date.parse(run.updatedAt) : 0);
  return runs
    .filter((run) => {
      const text = `${run.repo}\n${run.title ?? ""}\n#${run.issue}`.toLowerCase();
      return tokens.every((token) => text.includes(token));
    })
    .sort((a, b) => Number(isFinished(a.phase)) - Number(isFinished(b.phase)) || updated(b) - updated(a))
    .slice(0, limit);
}
