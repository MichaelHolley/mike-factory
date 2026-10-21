import { defineDoc, defineDocFamily, type ConversationId } from "@earendil-works/pi-durable";

export type IssuePhase = "queued" | "prepare" | "implement" | "verify" | "fix" | "publish" | "report" | "done" | "failed" | "aborted";

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
  }),
  checkpointWhen: () => false,
});

export const asConversationId = (id: number) => id as ConversationId;
