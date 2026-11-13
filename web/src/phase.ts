import {
  Ban,
  Check,
  Code,
  FlaskConical,
  FolderGit2,
  GitPullRequestArrow,
  Hourglass,
  MessageSquareReply,
  MessageSquareText,
  Wrench,
  X,
} from "@lucide/vue";
import type { Component } from "vue";
import type { IssuePhase } from "../../src/runStatus.ts";

export type StepState = "passed" | "current" | "pending";

const FLOW = ["queued", "prepare", "implement", "verify", "fix", "revise", "publish", "report"] as const;
const OUTCOMES: readonly IssuePhase[] = ["done", "failed", "aborted"];

// Hue groups the kind of work: setup, building, checking, your notes, shipping, outcome.
export const stepLook: Record<IssuePhase, { icon: Component; hue: string }> = {
  queued: { icon: Hourglass, hue: "text-setup" },
  prepare: { icon: FolderGit2, hue: "text-setup" },
  implement: { icon: Code, hue: "text-run" },
  verify: { icon: FlaskConical, hue: "text-check" },
  fix: { icon: Wrench, hue: "text-run" },
  revise: { icon: MessageSquareReply, hue: "text-you" },
  publish: { icon: GitPullRequestArrow, hue: "text-ship" },
  report: { icon: MessageSquareText, hue: "text-ship" },
  done: { icon: Check, hue: "text-ok" },
  failed: { icon: X, hue: "text-bad" },
  aborted: { icon: Ban, hue: "text-halt" },
};

export function isFinished(phase: IssuePhase): boolean {
  return OUTCOMES.includes(phase);
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
