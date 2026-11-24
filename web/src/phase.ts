import {
  Ban,
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
const OUTCOMES: readonly IssuePhase[] = ["review", "merged", "closed", "failed", "aborted"];

// Hue says who has the run: muted while it waits, blue while mike writes code, amber while it checks and wraps up, then the outcome. The icon names the step.
export const stepLook: Record<IssuePhase, { icon: Component; hue: string }> = {
  queued: { icon: Hourglass, hue: "text-muted" },
  prepare: { icon: FolderGit2, hue: "text-muted" },
  implement: { icon: Code, hue: "text-run" },
  verify: { icon: FlaskConical, hue: "text-wrap" },
  fix: { icon: Wrench, hue: "text-wrap" },
  revise: { icon: MessageSquareReply, hue: "text-wrap" },
  publish: { icon: GitPullRequestArrow, hue: "text-wrap" },
  report: { icon: MessageSquareText, hue: "text-wrap" },
  review: { icon: Eye, hue: "text-ok" },
  merged: { icon: GitMerge, hue: "text-merged" },
  closed: { icon: GitPullRequestClosed, hue: "text-halt" },
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
  const outcome = OUTCOMES.includes(phase) ? phase : "review";
  const current = OUTCOMES.includes(phase) ? FLOW.length : (FLOW as readonly IssuePhase[]).indexOf(phase);
  // A failed or aborted run doesn't record where it stopped, so earlier steps can't be shown as passed.
  const reached = phase === "failed" || phase === "aborted" ? 0 : current;
  return [...FLOW, outcome].map((name, i) => {
    if (i === current) return { name, state: "current" };
    return { name, state: i < reached ? "passed" : "pending" };
  });
}
