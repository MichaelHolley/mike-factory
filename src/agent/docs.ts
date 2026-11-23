import { defineDoc, defineDocFamily, type ConversationId } from "@earendil-works/pi-durable";
import type { RepoSettings } from "../config.ts";
import type { ReviewFeedback } from "../contracts.ts";
import type { Attachment, PipelinePhase, PrState } from "../runStatus.ts";
import type { RunStart } from "./extensions/guards.ts";

export type { PipelinePhase };

/** What a run uses of its repo, read once at `prepare`, so a crash rerun or a later default-branch change can't mix settings. */
export type RunSettings = RepoSettings & { defaultBranch: string };

export type IssueIndexValue = { conversationId: number | null };

export const IssueIndex = defineDocFamily<IssueIndexValue, null>({
  kind: "app.issueIndex",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ conversationId: null }),
  checkpointWhen: () => false,
});

export type IssueStateValue = {
  repo: string;
  issue: number;
  title?: string | null;
  branch: string;
  worktreePath: string;
  phase: PipelinePhase;
  attempts: number;
  prUrl: string | null;
  prState?: PrState | null;
  /** Legacy: read for runs stored before `prState`, never written. */
  prMerged?: boolean;
  costUsd: number;
  lastError: string | null;
  pipelineTaskId: number | null;
  requestId: string | null;
  /** Null until the run's `prepare` has read them. */
  settings?: RunSettings | null;
  /** The setup command that last succeeded in the worktree, so a changed one runs again. */
  setupRan?: string | null;
  /** `revise` rounds of the current run; keeps fix request IDs unique once a revision restarts the attempts. */
  revisions?: number;
  prTitle?: string | null;
  prBody?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  /** Issue or PR number that carries the run's status comment; null means the issue. */
  statusOn?: number | null;
  prNumber?: number | null;
  /** Login whose review the run requests when it finishes; set by the `/mike` comment or PR feedback that started it. */
  reviewer?: string | null;
  /** Branch head `publish` last pushed. */
  pushedHead?: string | null;
  /** `pushedHead` when the run started, so a head equal to it means the run has nothing new to verify or push. */
  startHead?: string | null;
  /** Conversation spend when the run started, so budgets count per run. */
  budgetFrom?: RunStart | null;
};

export const IssueState = defineDoc<IssueStateValue>({
  kind: "app.issueState",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({
    repo: "",
    issue: 0,
    title: null,
    branch: "",
    worktreePath: "",
    phase: "prepare",
    attempts: 0,
    prUrl: null,
    prState: null,
    costUsd: 0,
    lastError: null,
    pipelineTaskId: null,
    requestId: null,
    settings: null,
    setupRan: null,
    prTitle: null,
    prBody: null,
    startedAt: null,
    updatedAt: null,
    statusOn: null,
    prNumber: null,
    reviewer: null,
    pushedHead: null,
    startHead: null,
    budgetFrom: null,
  }),
  checkpointWhen: () => false,
});

export const asConversationId = (id: number) => id as ConversationId;

/**
 * A message from the owner on the run page or PR; `id` is the client's UUID or the webhook action's id, so a retry adds
 * nothing. `tries` counts deliveries withdrawn by a stop, so the next delivery submits under a fresh request ID. A
 * review note carries the review, and its `text` holds the `/mike` instructions.
 */
export type Note = {
  id: string;
  text: string;
  at: string;
  deliveredAt: string | null;
  tries?: number;
  review?: ReviewFeedback;
  attachments?: Attachment[];
};

/** Kept apart from `IssueState` so the pipeline's patches and the server's note writes never clobber each other. */
export const IssueNotes = defineDoc<{ items: Note[] }>({
  kind: "app.issueNotes",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ items: [] }),
  checkpointWhen: () => false,
});

/** The agent's draft replies to review comments, which `report` posts after pushing; `postedAt` also settles a skipped one. */
export type ReviewReply = { commentId: number; body: string; postedAt: string | null };

export const ReviewReplies = defineDoc<{ items: ReviewReply[] }>({
  kind: "app.reviewReplies",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ items: [] }),
  checkpointWhen: () => false,
});

/** Entry kind of a delivered note; its data is `{ id, text, review?, attachments? }` and its model message is the note prompt. */
export const HUMAN_ENTRY = "app.human";
