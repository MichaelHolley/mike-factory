export type IssuePhase = "queued" | "prepare" | "implement" | "verify" | "fix" | "publish" | "report" | "done" | "failed" | "aborted";

export type TranscriptItem =
  | { kind: "user" | "assistant"; text: string }
  | { kind: "tool-call"; name: string; args: string }
  | { kind: "tool-result"; name: string; text: string; isError: boolean };

export type RunStatus = {
  repo: string;
  issue: number;
  issueUrl: string;
  branch: string;
  phase: IssuePhase;
  attempts: number;
  costUsd: number;
  prUrl: string | null;
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string | null;
};
