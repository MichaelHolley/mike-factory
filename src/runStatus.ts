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

export type TranscriptItem =
  | { kind: "user" | "assistant"; text: string }
  | { kind: "human"; text: string; pending?: true }
  | { kind: "tool"; name: string; summary: string; args: string; result?: { text: string; isError: boolean } };

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
