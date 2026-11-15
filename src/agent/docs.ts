import { defineDoc, defineDocFamily, type ConversationId } from "@earendil-works/pi-durable";
import type { ReviewFeedback } from "../contracts.ts";
import type { IssuePhase } from "../runStatus.ts";

export type { IssuePhase };

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
  phase: IssuePhase;
  attempts: number;
  prUrl: string | null;
  costUsd: number;
  lastError: string | null;
  pipelineTaskId: number | null;
  requestId: string | null;
  setupDone: boolean;
  /** `revise` rounds of the current run; keeps fix request IDs unique once a revision restarts the attempts. */
  revisions?: number;
  prTitle?: string | null;
  prBody?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  /** Issue or PR number that carries the run's status comment; null means the issue. */
  statusOn?: number | null;
  prNumber?: number | null;
  /** Login whose review the run re-requests when it finishes; set by PR feedback. */
  reviewer?: string | null;
  /** Branch head when the run started; an unchanged head means the run made no commits. */
  startHead?: string | null;
  /** Conversation spend when the run started, so budgets count per run. */
  budgetFrom?: { turns: number; costUsd: number } | null;
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
    costUsd: 0,
    lastError: null,
    pipelineTaskId: null,
    requestId: null,
    setupDone: false,
    prTitle: null,
    prBody: null,
    startedAt: null,
    updatedAt: null,
    statusOn: null,
    prNumber: null,
    reviewer: null,
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

/** The agent's draft replies to review comments, which `report` posts after pushing. */
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

/** Entry kind of a delivered note; its data is `{ id, text, review? }` and its model message is the note prompt. */
export const HUMAN_ENTRY = "app.human";
