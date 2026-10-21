import type { IssuePhase } from "../../src/runStatus.ts";

export type PhaseTone = "idle" | "run" | "ok" | "bad" | "halt";
export type StepState = "passed" | "current" | "pending";

const FLOW = ["queued", "prepare", "implement", "verify", "fix", "publish", "report"] as const;
const OUTCOMES: readonly IssuePhase[] = ["done", "failed", "aborted"];

export function phaseTone(phase: IssuePhase): PhaseTone {
  switch (phase) {
    case "queued":
      return "idle";
    case "done":
      return "ok";
    case "failed":
      return "bad";
    case "aborted":
      return "halt";
    default:
      return "run";
  }
}

/** Every pipeline state in order, ending in the run's outcome slot (done, failed or aborted). */
export function pipelineSteps(phase: IssuePhase): { name: IssuePhase; state: StepState }[] {
  const outcome = OUTCOMES.includes(phase) ? phase : "done";
  const current = OUTCOMES.includes(phase) ? FLOW.length : (FLOW as readonly IssuePhase[]).indexOf(phase);
  // A failed or aborted run doesn't record where it stopped, so earlier steps can't be shown as passed.
  const reached = phase === "done" ? current : phase === "failed" || phase === "aborted" ? 0 : current;
  return [...FLOW, outcome].map((name, i) => ({
    name,
    state: i === current ? "current" : i < reached ? "passed" : "pending",
  }));
}
