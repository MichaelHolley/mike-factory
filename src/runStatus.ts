import type { RunFailureReason } from "@earendil-works/pi-durable";

/** A phase the pipeline stores. */
export type PipelinePhase =
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

export type PrState = "open" | "merged" | "closed";

/** A run's public phase: a finished run with a PR is in review until the PR merges or closes. */
export type IssuePhase = Exclude<PipelinePhase, "done"> | "review" | "merged" | "closed";

/** A PR review the owner sent, as the run page shows it. */
export type ReviewCard = {
  reviewer: string;
  state: string;
  url: string;
  comments: { path: string; line: number | null; body: string; url: string }[];
};

/** A file attached to a message: stored at `path`, `<folder>/<name>` under the issue's attachments, or skipped. */
export type AttachedFile = { name: string; source: string } & ({ path: string } | { skipped: string });

export type TranscriptItem =
  | { kind: "user"; text: string; files?: AttachedFile[] }
  /** `streaming`: still being written. `interrupted`: cut off before it was finished. */
  | { kind: "assistant"; text: string; streaming?: true; interrupted?: true }
  | { kind: "human"; text: string; pending?: true; review?: ReviewCard; files?: AttachedFile[] }
  | {
      kind: "tool";
      name: string;
      summary: string;
      args: string;
      result?: { text: string; isError: boolean };
      /** What the call printed so far, empty before its first output; set only while it runs. */
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
  /** Null when unknown, for runs published before PR states were stored. */
  prState: PrState | null;
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string | null;
};
