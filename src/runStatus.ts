export type IssuePhase = "queued" | "prepare" | "implement" | "verify" | "fix" | "publish" | "report" | "done" | "failed" | "aborted";

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
