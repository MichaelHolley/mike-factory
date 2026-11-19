import {
  Ban,
  Check,
  Code,
  Eye,
  FlaskConical,
  FolderGit2,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  GitPullRequestClosed,
  Hourglass,
  MessageSquareReply,
  MessageSquareText,
  Wrench,
  X,
} from "@lucide/vue";
import type { Component } from "vue";
import type { IssuePhase, PrState } from "../../src/runStatus.ts";

export type StepState = "passed" | "current" | "pending";

const FLOW = ["queued", "prepare", "implement", "verify", "fix", "revise", "publish", "report"] as const;
const OUTCOMES: readonly IssuePhase[] = ["review", "merged", "closed", "done", "failed", "aborted"];

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
  review: { icon: Eye, hue: "text-you" },
  merged: { icon: GitMerge, hue: "text-merged" },
  closed: { icon: GitPullRequestClosed, hue: "text-halt" },
  done: { icon: Check, hue: "text-ok" },
  failed: { icon: X, hue: "text-bad" },
  aborted: { icon: Ban, hue: "text-halt" },
};

/** The pipeline has ended; a run in review may still merge or close. */
export function isIdle(phase: IssuePhase): boolean {
  return OUTCOMES.includes(phase);
}

export function isFinished(phase: IssuePhase): boolean {
  return phase !== "review" && isIdle(phase);
}

const PR_LOOK = {
  open: { icon: GitPullRequest, tone: "default", hue: "", label: "Open pull request" },
  merged: { icon: GitMerge, tone: "merged", hue: "text-merged", label: "Open merged pull request" },
  closed: { icon: GitPullRequestClosed, tone: "closed", hue: "text-halt", label: "Open closed pull request" },
} as const;

/** How a run's PR link looks; an unknown state looks open. */
export function prLook(state: PrState | null) {
  return PR_LOOK[state ?? "open"];
}

/** Every pipeline state in order, ending in the run's outcome slot. */
export function pipelineSteps(phase: IssuePhase): { name: IssuePhase; state: StepState }[] {
  const outcome = OUTCOMES.includes(phase) ? phase : "done";
  const current = OUTCOMES.includes(phase) ? FLOW.length : (FLOW as readonly IssuePhase[]).indexOf(phase);
  // A failed or aborted run doesn't record where it stopped, so earlier steps can't be shown as passed.
  const reached = phase === "failed" || phase === "aborted" ? 0 : current;
  return [...FLOW, outcome].map((name, i) => {
    if (i === current) return { name, state: "current" };
    return { name, state: i < reached ? "passed" : "pending" };
  });
}
