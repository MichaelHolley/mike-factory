import {
  Ban,
  Code,
  Eye,
  FlaskConical,
  FolderGit2,
  GitMerge,
  GitPullRequestArrow,
  GitPullRequestClosed,
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
const FINISHED: readonly IssuePhase[] = ["merged", "closed", "failed", "aborted"];
const ENDED: readonly IssuePhase[] = ["done", ...FINISHED];

// Hue groups the kind of work: setup, building, checking, your notes, shipping, outcome.
export const stepLook: Record<IssuePhase, { icon: Component; hue: string; label?: string }> = {
  queued: { icon: Hourglass, hue: "text-setup" },
  prepare: { icon: FolderGit2, hue: "text-setup" },
  implement: { icon: Code, hue: "text-run" },
  verify: { icon: FlaskConical, hue: "text-check" },
  fix: { icon: Wrench, hue: "text-run" },
  revise: { icon: MessageSquareReply, hue: "text-you" },
  publish: { icon: GitPullRequestArrow, hue: "text-ship" },
  report: { icon: MessageSquareText, hue: "text-ship" },
  done: { icon: Eye, hue: "text-you", label: "in review" },
  merged: { icon: GitMerge, hue: "text-merged" },
  closed: { icon: GitPullRequestClosed, hue: "text-halt" },
  failed: { icon: X, hue: "text-bad" },
  aborted: { icon: Ban, hue: "text-halt" },
};

export const phaseLabel = (phase: IssuePhase) => stepLook[phase].label ?? phase;

/** Nothing more will happen: the PR merged or closed, or the run failed or was aborted. */
export function isFinished(phase: IssuePhase): boolean {
  return FINISHED.includes(phase);
}

/** No pipeline is running; a `done` run waits on its PR's review. */
export function hasEnded(phase: IssuePhase): boolean {
  return ENDED.includes(phase);
}

/** Every pipeline state in order, ending in the run's outcome slot, `done` until the run ends otherwise. */
export function pipelineSteps(phase: IssuePhase): { name: IssuePhase; state: StepState }[] {
  const ended = hasEnded(phase);
  const current = ended ? FLOW.length : (FLOW as readonly IssuePhase[]).indexOf(phase);
  // A failed or aborted run doesn't record where it stopped, so earlier steps can't be shown as passed.
  const reached = phase === "failed" || phase === "aborted" ? 0 : current;
  return [...FLOW, ended ? phase : "done"].map((name, i) => {
    if (i === current) return { name, state: "current" };
    return { name, state: i < reached ? "passed" : "pending" };
  });
}
