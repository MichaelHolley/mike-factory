import { defineDoc, defineDocFamily, type ConversationId } from "@earendil-works/pi-durable";
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
  }),
  checkpointWhen: () => false,
});

export const asConversationId = (id: number) => id as ConversationId;

/**
 * A message from the owner on the run page; `id` is the client's UUID, so a retried POST adds nothing. `tries` counts
 * deliveries withdrawn by a stop, so the next delivery submits under a fresh request ID.
 */
export type Note = { id: string; text: string; at: string; deliveredAt: string | null; tries?: number };

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

/** Entry kind of a delivered note; its data is `{ id, text }` and its model message is the note prompt. */
export const HUMAN_ENTRY = "app.human";
