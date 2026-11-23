import type { PrState, RunStatus, TranscriptItem } from "./runStatus.ts";

export const branchName = (issue: number, slug: string) => `mike/${issue}-${slug}`;
/** Branch of conversations started before branches were named by the model. */
export const legacyBranchName = (issue: number) => `agent/issue-${issue}`;
export const issueKey = (owner: string, repo: string, issue: number) => `${owner}/${repo}#${issue}`;

const BRANCH_SLUG_MAX = 40;

/** A branch name fragment from free text: lowercase words joined by hyphens, at most 40 characters. */
export function branchSlug(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= BRANCH_SLUG_MAX) return slug || "issue";
  const cut = slug.slice(0, BRANCH_SLUG_MAX + 1);
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : cut.slice(0, BRANCH_SLUG_MAX)).replace(/-+$/, "");
}

/** The issue a branch named by `branchName` or `legacyBranchName` belongs to. */
export function issueOfBranch(ref: string): number | undefined {
  const match = /^mike\/(\d+)-[a-z0-9-]+$/.exec(ref) ?? /^agent\/issue-(\d+)$/.exec(ref);
  return match ? Number(match[1]) : undefined;
}

/** The issue behind an agent PR's head branch, or why the PR is not one. A fork can use an agent branch name too. */
export function agentPrIssue(head: { ref?: string; fromFork: boolean }): { issue: number } | { reason: string } {
  const issue = issueOfBranch(head.ref ?? "");
  if (issue === undefined) return { reason: `branch ${head.ref} is not an agent branch` };
  if (head.fromFork) return { reason: "pull request comes from a fork" };
  return { issue };
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

/** Base64 image bytes, bounded and MIME-checked by the server's GitHub client. */
export interface IssueImage {
  data: string;
  mimeType: string;
}

export type IssueImageDownload = { ok: true; image: IssueImage } | { ok: false; reason: string };

/** `truncated` when the file was cut at a character boundary to fit the server's size limit. */
export type IssueTextDownload = { ok: true; text: string; truncated: boolean } | { ok: false; reason: string };

export interface PullRequestRef {
  number: number;
  url: string;
}

export interface PullRequestInfo extends PullRequestRef {
  state: PrState;
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
  /** The repo's default branch, from its metadata. */
  defaultBranch(repo: string): Promise<string>;
  getIssue(repo: string, issue: number): Promise<IssueData>;
  listIssueComments(repo: string, issue: number): Promise<IssueComment[]>;
  /**
   * Downloads only GitHub issue attachments, authenticated on the server; no credentials reach the runner.
   * Never throws: skipped attachments and failures return `ok: false`.
   */
  downloadIssueImage(repo: string, url: string): Promise<IssueImageDownload>;
  /** Like `downloadIssueImage`, for UTF-8 text file attachments. */
  downloadIssueText(repo: string, url: string): Promise<IssueTextDownload>;
  /** Creates the comment, or edits the bot's existing comment that carries the same hidden `marker`. */
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
  /**
   * Replies in the thread of `commentId` unless the bot already posted a reply carrying the hidden `marker`. False when the PR
   * has no such comment.
   */
  replyToReviewComment(repo: string, pr: number, commentId: number, marker: string, body: string): Promise<boolean>;
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
  /**
   * Idempotent: create, or reuse the existing path or branch. A new branch starts from its remote copy only with `openPr`,
   * otherwise from `defaultBranch`.
   */
  prepare(
    repo: string,
    issue: number,
    opts: { branch: string; openPr: boolean; defaultBranch: string },
  ): Promise<WorktreeInfo>;
  /** `path` on `branch` of the trusted mirror as of its last fetch, or undefined when the branch has no such file. */
  trustedFile(repo: string, branch: string, path: string): Promise<string | undefined>;
  /** `git status --porcelain` of the worktree: uncommitted, non-ignored changes, empty when clean. */
  uncommitted(repo: string, issue: number): Promise<string>;
  /** Pushes `branch` (and only that ref) to origin. Idempotent. */
  push(repo: string, branch: string, defaultBranch: string): Promise<void>;
  /** Commit the issue branch points at. */
  headSha(repo: string, issue: number, branch: string): Promise<string>;
  /** Number of commits on the issue branch that are not on `origin/<defaultBranch>`. */
  commitsAhead(repo: string, issue: number, branch: string, defaultBranch: string): Promise<number>;
  /** Subject of the latest commit on the issue branch. */
  latestCommitSubject(repo: string, issue: number, branch: string): Promise<string>;
  /** Idempotent: removes the worktree and every local branch of the issue, then prunes. */
  remove(repo: string, issue: number): Promise<void>;
  /** Repos that have a trusted mirror. */
  repos(): Promise<string[]>;
  /** Issues that still have a local worktree or agent branch. */
  issues(repo: string): Promise<number[]>;
  /** Runs `git worktree prune` on the bare clone, if there is one. */
  prune(repo: string): Promise<void>;
}

export type WebhookAction =
  /** `requestId` is `comment-<id>` of the triggering comment, so a redelivered webhook maps to the same run. */
  | { kind: "start"; repo: string; issue: number; requestId: string; instructions: string; reviewer: string }
  | { kind: "stop"; repo: string; issue: number; requestId: string }
  /** An agent PR was merged, closed or reopened. */
  | { kind: "pr-state"; repo: string; issue: number; branch: string; state: PrState }
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

/** A live view of one issue's conversation, held until `stop()`. */
export type TranscriptWatch = {
  /** The whole conversation as a public projection, history before any compaction included. */
  items(): Promise<TranscriptItem[]>;
  stop(): void;
};

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
  /**
   * Records the PR's state on the run. Once the PR isn't open, removes the issue's worktree and local branch unless a
   * pipeline is still running for it.
   */
  prState(action: Extract<WebhookAction, { kind: "pr-state" }>): Promise<void>;
  /**
   * Records agent PRs that merged or closed without a webhook, removes worktrees and branches of runs whose PR merged
   * or closed and of closed issues, then prunes every repo.
   */
  sweep(): Promise<void>;
  status(): Promise<RunStatus[]>;
  /**
   * The issue's stored conversation as a public projection, without what is still in flight, or undefined when the
   * issue has none.
   */
  transcript(repo: string, issue: number): Promise<TranscriptItem[] | undefined>;
  /** Calls `listener` after any run's status may have changed. Returns an unsubscribe. */
  subscribeStatus(listener: () => void): () => void;
  /** Watches the issue's conversation, calling `listener` after it may have changed; undefined when the issue has none. */
  watchTranscript(repo: string, issue: number, listener: () => void): Promise<TranscriptWatch | undefined>;
}
