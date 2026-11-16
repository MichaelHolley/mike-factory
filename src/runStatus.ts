import type { RunFailureReason } from "@earendil-works/pi-durable";

export type IssuePhase =
  | "queued"
  | "prepare"
  | "implement"
  | "verify"
  | "fix"
  | "revise"
  | "publish"
  | "report"
  | "done"
  | "failed"
  | "aborted";

/** A PR review the owner sent, as the run page shows it. */
export type ReviewCard = {
  reviewer: string;
  state: string;
  url: string;
  comments: { path: string; line: number | null; body: string; url: string }[];
};

export type TranscriptItem =
  | { kind: "user"; text: string }
  /** `streaming`: still being written. `interrupted`: cut off before it was finished. */
  | { kind: "assistant"; text: string; streaming?: true; interrupted?: true }
  | { kind: "human"; text: string; pending?: true; review?: ReviewCard }
  | {
      kind: "tool";
      name: string;
      summary: string;
      args: string;
      result?: { text: string; isError: boolean };
      /** What the call printed so far, while it runs. */
      output?: string;
    }
  /** The agent is working; `retry` is the error it waits out before trying again. */
  | { kind: "busy"; retry?: string }
  /** Why the agent's last run ended without an answer. */
  | { kind: "failure"; reason: RunFailureReason; detail?: string };

export type RunStatus = {
  repo: string;
  issue: number;
  issueUrl: string;
  title: string | null;
  branch: string;
  phase: IssuePhase;
  attempts: number;
  costUsd: number;
  model: string | null;
  thinkingLevel: string | null;
  prUrl: string | null;
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string | null;
};
