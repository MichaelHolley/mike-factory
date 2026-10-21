import type { RunStatus, TranscriptItem } from "./runStatus.ts";
import type { RepoConfig } from "./config.ts";

export const branchName = (issue: number) => `agent/issue-${issue}`;
export const issueKey = (owner: string, repo: string, issue: number) => `${owner}/${repo}#${issue}`;

export interface IssueData {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: "open" | "closed";
}

export interface IssueComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface PullRequestRef {
  number: number;
  url: string;
}

export interface GitIdentity {
  name: string;
  email: string;
}

/** GitHub access for one owner; every `repo` is a bare repo name under that owner. */
export interface GitHubClient {
  getIssue(repo: string, issue: number): Promise<IssueData>;
  listIssueComments(repo: string, issue: number): Promise<IssueComment[]>;
  /** Creates the comment, or edits the existing one that carries the same hidden `marker`. */
  upsertComment(repo: string, issue: number, marker: string, body: string): Promise<void>;
  findOpenPr(repo: string, head: string): Promise<PullRequestRef | undefined>;
  createPr(repo: string, pr: { head: string; base: string; title: string; body: string }): Promise<PullRequestRef>;
  /** Short-lived token for git over HTTPS. Only push/fetch code may see it. */
  gitToken(repo: string): Promise<string>;
  botIdentity(): Promise<GitIdentity>;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  /** False when an existing worktree was reused (resume after crash or a repeated `/mike` command). */
  created: boolean;
}

/** Bare clones under `<dataDir>/repos`, worktrees under `<dataDir>/worktrees/<repo>/issue-<n>`. */
export interface Worktrees {
  worktreePath(repo: string, issue: number): string;
  /** Idempotent: create, or reuse the existing path or branch. */
  prepare(repo: RepoConfig, issue: number): Promise<WorktreeInfo>;
  /** Stages everything and commits if there is anything to commit. Returns whether a commit was made. */
  commitAll(repo: string, issue: number, message: string): Promise<boolean>;
  /** Pushes `agent/issue-<n>` (and only that ref) to origin. Idempotent. */
  push(repo: string, issue: number): Promise<void>;
  /** Number of commits on the issue branch that are not on `origin/<defaultBranch>`. */
  commitsAhead(repo: RepoConfig, issue: number): Promise<number>;
  /** Idempotent: removes worktree and local branch, then prunes. */
  remove(repo: string, issue: number): Promise<void>;
  /** Issues that still have a local worktree or `agent/issue-<n>` branch. */
  issues(repo: string): Promise<number[]>;
  /** Runs `git worktree prune` on the bare clone, if there is one. */
  prune(repo: string): Promise<void>;
}

export type WebhookAction =
  /** `requestId` is `comment-<id>` of the triggering comment, so a redelivered webhook maps to the same run. */
  | { kind: "start"; repo: string; issue: number; requestId: string; instructions: string }
  | { kind: "stop"; repo: string; issue: number; requestId: string }
  /** An agent PR was merged or closed. */
  | { kind: "cleanup"; repo: string; issue: number }
  | { kind: "ignore"; reason: string };

/** What the HTTP server calls. Implemented by the Pi Durable layer. */
export interface IssueService {
  start(action: Extract<WebhookAction, { kind: "start" }>): Promise<void>;
  stop(action: Extract<WebhookAction, { kind: "stop" }>): Promise<void>;
  /** Removes the issue's worktree and local branch unless a pipeline is still running for it. */
  cleanup(action: Extract<WebhookAction, { kind: "cleanup" }>): Promise<void>;
  /** Removes worktrees and branches of closed issues, then prunes every repo. */
  sweep(): Promise<void>;
  status(): Promise<RunStatus[]>;
  /** The issue's conversation as a public projection, or undefined when the issue has none. */
  transcript(repo: string, issue: number): Promise<TranscriptItem[] | undefined>;
}
