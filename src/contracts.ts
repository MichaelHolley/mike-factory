import type { RunStatus, TranscriptItem } from "./runStatus.ts";
import type { RepoConfig } from "./config.ts";

export const branchName = (issue: number) => `agent/issue-${issue}`;
export const issueKey = (owner: string, repo: string, issue: number) => `${owner}/${repo}#${issue}`;

/** The issue behind an agent PR's head branch, or why the PR is not one. A fork can name its branch agent/issue-<n> too. */
export function agentPrIssue(head: { ref?: string; fromFork: boolean }): { issue: number } | { reason: string } {
  const match = /^agent\/issue-(\d+)$/.exec(head.ref ?? "");
  if (!match) return { reason: `branch ${head.ref} is not an agent branch` };
  if (head.fromFork) return { reason: "pull request comes from a fork" };
  return { issue: Number(match[1]) };
}

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

export interface PullRequestInfo extends PullRequestRef {
  state: "open" | "closed";
  headRef: string;
  fromFork: boolean;
}

export type ReviewComment = {
  id: number;
  /** The thread's first comment; GitHub only takes replies to it. */
  threadRootId: number;
  path: string;
  line: number | null;
  diffHunk: string;
  body: string;
  url: string;
  /** Earlier comments in the same thread, oldest first. */
  thread: { author: string; body: string }[];
};

export type ReviewFeedback = {
  reviewer: string;
  /** Lowercase GitHub review state, e.g. `changes_requested`. */
  state: string;
  body: string;
  url: string;
  comments: ReviewComment[];
};

export interface ReviewThread {
  path: string;
  line: number | null;
  comments: { id: number; author: string; body: string }[];
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
  updatePr(repo: string, number: number, pr: { title: string; body: string }): Promise<void>;
  getPr(repo: string, number: number): Promise<PullRequestInfo>;
  getReviewFeedback(repo: string, pr: number, reviewId: number): Promise<ReviewFeedback>;
  /** Unresolved review threads of the PR. */
  listReviewThreads(repo: string, pr: number): Promise<ReviewThread[]>;
  /** Adds an 👀 reaction to an issue comment, review or review comment by its GraphQL node id. Idempotent. */
  react(repo: string, nodeId: string): Promise<void>;
  /** Replies in the thread of `commentId` unless a reply carrying the hidden `marker` already exists. */
  replyToReviewComment(repo: string, pr: number, commentId: number, marker: string, body: string): Promise<void>;
  requestReview(repo: string, pr: number, login: string): Promise<void>;
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
  /** Idempotent: create, or reuse the existing path or branch. A new branch starts from its remote copy only with `openPr`. */
  prepare(repo: RepoConfig, issue: number, opts: { openPr: boolean }): Promise<WorktreeInfo>;
  /** `git status --porcelain` of the worktree: uncommitted, non-ignored changes, empty when clean. */
  uncommitted(repo: string, issue: number): Promise<string>;
  /** Pushes `agent/issue-<n>` (and only that ref) to origin. Idempotent. */
  push(repo: RepoConfig, issue: number): Promise<void>;
  /** Commit the issue branch points at. */
  headSha(repo: string, issue: number): Promise<string>;
  /** Number of commits on the issue branch that are not on `origin/<defaultBranch>`. */
  commitsAhead(repo: RepoConfig, issue: number): Promise<number>;
  /** Subject of the latest commit on the issue branch. */
  latestCommitSubject(repo: string, issue: number): Promise<string>;
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
  /**
   * Owner feedback on an agent PR. `id` is `review-<reviewId>` for a review and its inline comments, so one review is
   * one trigger, or `pr-comment-<id>` for a conversation comment. `nodeId` is the triggering object, for the reaction.
   */
  | {
      kind: "feedback";
      repo: string;
      pr: number;
      id: string;
      reviewer: string;
      nodeId: string;
      source: { type: "review"; reviewId: number } | { type: "comment" };
      instructions: string;
    }
  | { kind: "pr-stop"; repo: string; pr: number }
  | { kind: "ignore"; reason: string };

/** What the HTTP server calls. Implemented by the Pi Durable layer. */
export interface IssueService {
  start(action: Extract<WebhookAction, { kind: "start" }>): Promise<void>;
  stop(action: Extract<WebhookAction, { kind: "stop" | "pr-stop" }>): Promise<void>;
  /** Stores PR feedback as a note: steered into the issue's live run, or starting a run that reports on the PR. */
  feedback(action: Extract<WebhookAction, { kind: "feedback" }>): Promise<void>;
  /**
   * Stores an owner message from the run page. A live pipeline steers it into the agent's work (`steered`); otherwise
   * it starts a follow-up run on the same conversation and branch (`started`). A repeated `id` adds nothing.
   */
  message(message: {
    repo: string;
    issue: number;
    id: string;
    text: string;
  }): Promise<"steered" | "started" | "not_found">;
  /** Removes the issue's worktree and local branch unless a pipeline is still running for it. */
  cleanup(action: Extract<WebhookAction, { kind: "cleanup" }>): Promise<void>;
  /** Removes worktrees and branches of closed issues, then prunes every repo. */
  sweep(): Promise<void>;
  status(): Promise<RunStatus[]>;
  /** The issue's conversation as a public projection, or undefined when the issue has none. */
  transcript(repo: string, issue: number): Promise<TranscriptItem[] | undefined>;
  /** Calls `listener` after any run's status may have changed. Returns an unsubscribe. */
  subscribeStatus(listener: () => void): () => void;
  /** Calls `listener` after the issue's conversation may have changed; undefined when the issue has none. */
  subscribeTranscript(repo: string, issue: number, listener: () => void): Promise<(() => void) | undefined>;
}
