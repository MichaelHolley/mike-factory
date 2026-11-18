import type { RunStatus } from "../../src/runStatus.ts";
import { isFinished } from "./phase.ts";

export type Outcome = "merged" | "done" | "failed" | "aborted";

export type FinishedFilter = {
  repo: string | null;
  outcome: Outcome | null;
  /** Inclusive local dates as `YYYY-MM-DD`. */
  started: [string, string] | null;
};

export function outcomeOf(run: RunStatus): Outcome | null {
  if (!isFinished(run.phase)) return null;
  if (run.phase === "done" && run.prMerged) return "merged";
  return run.phase as Exclude<Outcome, "merged">;
}

/** `YYYY-MM-DD` in the viewer's time zone, the shape the date picker uses. */
export function localDate(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Finished runs matching the filter, newest finish first. A finished run's last update is when it finished. */
export function filterFinished(runs: readonly RunStatus[], filter: FinishedFilter): RunStatus[] {
  const finishedAt = (run: RunStatus) => (run.updatedAt ? Date.parse(run.updatedAt) : 0);
  return runs
    .filter((run) => {
      const outcome = outcomeOf(run);
      if (!outcome) return false;
      if (filter.repo && run.repo !== filter.repo) return false;
      if (filter.outcome && outcome !== filter.outcome) return false;
      if (filter.started) {
        if (!run.startedAt) return false;
        const day = localDate(run.startedAt);
        if (day < filter.started[0] || day > filter.started[1]) return false;
      }
      return true;
    })
    .sort((a, b) => finishedAt(b) - finishedAt(a));
}
