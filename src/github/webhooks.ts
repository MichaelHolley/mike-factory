import { Webhooks } from "@octokit/webhooks";
import type { FactoryConfig } from "../config.ts";
import { agentPrIssue, type WebhookAction } from "../contracts.ts";

/** Who may trigger runs; the App's installations decide which repos. */
export type WebhookConfig = Pick<FactoryConfig, "owner" | "allowedSenderIds">;

export class InvalidSignatureError extends Error {
  constructor() {
    super("invalid webhook signature");
    this.name = "InvalidSignatureError";
  }
}

type Repository = { name?: string; full_name?: string; owner?: { login?: string } };
type Sender = { id?: number; login?: string };
type PrPayload = {
  number?: number;
  state?: string;
  merged?: boolean;
  head?: { ref?: string; repo?: { full_name?: string } | null };
};

interface IssueCommentPayload {
  action?: string;
  comment?: { id?: number; node_id?: string; body?: string };
  issue?: { number?: number; pull_request?: unknown };
  sender?: Sender;
  repository?: Repository;
}

interface PullRequestPayload {
  action?: string;
  pull_request?: PrPayload;
  repository?: Repository;
}

interface ReviewPayload {
  action?: string;
  review?: { id?: number; node_id?: string; body?: string | null; state?: string };
  pull_request?: PrPayload;
  sender?: Sender;
  repository?: Repository;
}

interface ReviewCommentPayload {
  action?: string;
  comment?: { id?: number; node_id?: string; body?: string; pull_request_review_id?: number | null };
  pull_request?: PrPayload;
  sender?: Sender;
  repository?: Repository;
}

type Command = { kind: "start"; instructions: string } | { kind: "stop" };

/** Reads `/mike [text]` or `/mike stop` from the first non-empty line; following lines belong to the instructions. */
export function parseCommand(body: string): Command | undefined {
  const [first = "", ...rest] = body.trimStart().split(/\r?\n/);
  const match = /^\/mike(?:\s+(.*))?$/i.exec(first.trimEnd());
  if (!match) return undefined;
  const args = match[1] ?? "";
  if (args.toLowerCase() === "stop") return { kind: "stop" };
  return { kind: "start", instructions: [args, ...rest].join("\n").trim() };
}

export async function verifyWebhook(input: {
  event: string;
  signature: string;
  rawBody: string;
  secret: string;
  config: WebhookConfig;
}): Promise<WebhookAction> {
  const { event, signature, rawBody, secret, config } = input;
  const valid = signature ? await new Webhooks({ secret }).verify(rawBody, signature).catch(() => false) : false;
  if (!valid) throw new InvalidSignatureError();

  if (!HANDLED_EVENTS.has(event)) return ignore(`event ${event} is not handled`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return ignore("payload is not valid JSON");
  }

  if (event === "pull_request") return pullRequestAction(parsed as PullRequestPayload, config);
  if (event === "pull_request_review") return reviewAction(parsed as ReviewPayload, config);
  if (event === "pull_request_review_comment") return reviewCommentAction(parsed as ReviewCommentPayload, config);

  const payload = parsed as IssueCommentPayload;
  if (payload.action !== "created") return ignore(`issue_comment action ${payload.action} is not handled`);

  const command = parseCommand(payload.comment?.body ?? "");
  if (!command) return ignore("comment is not a /mike command");

  const issue = payload.issue?.number;
  const repo = payload.repository?.name;
  const commentId = payload.comment?.id;
  if (typeof issue !== "number" || typeof commentId !== "number" || !repo)
    return ignore("payload has no issue number, comment id or repository");

  const notAllowed = senderNotAllowed(payload, config) ?? repoNotAllowed(payload, config);
  if (notAllowed) return ignore(notAllowed);

  if (payload.issue?.pull_request) {
    // The payload carries no head branch; the service checks the PR before acting on it.
    if (command.kind === "stop") return { kind: "pr-stop", repo, pr: issue };
    return {
      kind: "feedback",
      repo,
      pr: issue,
      id: `pr-comment-${commentId}`,
      reviewer: payload.sender?.login ?? "",
      nodeId: payload.comment?.node_id ?? "",
      source: { type: "comment" },
      instructions: command.instructions,
    };
  }
  return { ...command, repo, issue, requestId: `comment-${commentId}` };
}

const HANDLED_EVENTS = new Set(["issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment"]);

function pullRequestAction(payload: PullRequestPayload, config: WebhookConfig): WebhookAction {
  if (payload.action !== "closed" && payload.action !== "reopened")
    return ignore(`pull_request action ${payload.action} is not handled`);
  const target = agentPr(payload, config);
  if ("reason" in target) return ignore(target.reason);
  const closedAs = payload.pull_request?.merged === true ? "merged" : "closed";
  return {
    kind: "pr-state",
    repo: target.repo,
    issue: target.issue,
    branch: payload.pull_request?.head?.ref ?? "",
    state: payload.action === "reopened" ? "open" : closedAs,
  };
}

function reviewAction(payload: ReviewPayload, config: WebhookConfig): WebhookAction {
  if (payload.action !== "submitted") return ignore(`pull_request_review action ${payload.action} is not handled`);
  const review = payload.review;
  const body = review?.body ?? "";
  const command = parseCommand(body);
  if (!command && review?.state !== "changes_requested")
    return ignore(`review in state ${review?.state} has no /mike command`);
  if (typeof review?.id !== "number") return ignore("payload has no review id");
  return prFeedback(payload, config, command, {
    reviewId: review.id,
    nodeId: review.node_id ?? "",
    instructions: command?.kind === "start" ? command.instructions : body.trim(),
  });
}

function reviewCommentAction(payload: ReviewCommentPayload, config: WebhookConfig): WebhookAction {
  if (payload.action !== "created")
    return ignore(`pull_request_review_comment action ${payload.action} is not handled`);
  const comment = payload.comment;
  const command = parseCommand(comment?.body ?? "");
  if (!command) return ignore("comment is not a /mike command");
  if (typeof comment?.pull_request_review_id !== "number") return ignore("payload has no review id");
  return prFeedback(payload, config, command, {
    reviewId: comment.pull_request_review_id,
    nodeId: comment.node_id ?? "",
    instructions: command.kind === "start" ? command.instructions : "",
  });
}

function prFeedback(
  payload: ReviewPayload | ReviewCommentPayload,
  config: WebhookConfig,
  command: Command | undefined,
  trigger: { reviewId: number; nodeId: string; instructions: string },
): WebhookAction {
  const notAllowed = senderNotAllowed(payload, config);
  if (notAllowed) return ignore(notAllowed);

  const target = agentPr(payload, config);
  if ("reason" in target) return ignore(target.reason);
  if (!target.pr) return ignore("payload has no pull request number");

  if (command?.kind === "stop") return { kind: "pr-stop", repo: target.repo, pr: target.pr };
  if (payload.pull_request?.state !== "open") return ignore("pull request is not open");

  return {
    kind: "feedback",
    repo: target.repo,
    pr: target.pr,
    id: `review-${trigger.reviewId}`,
    reviewer: payload.sender?.login ?? "",
    nodeId: trigger.nodeId,
    source: { type: "review", reviewId: trigger.reviewId },
    instructions: trigger.instructions,
  };
}

/** The repo, PR and issue of an agent PR from the same repo, or why the payload is not one. */
function agentPr(
  payload: { pull_request?: PrPayload; repository?: Repository },
  config: WebhookConfig,
): { repo: string; pr: number; issue: number } | { reason: string } {
  const head = payload.pull_request?.head;
  const target = agentPrIssue({
    ref: head?.ref,
    fromFork: head?.repo?.full_name !== payload.repository?.full_name,
  });
  if ("reason" in target) return target;

  const notAllowed = repoNotAllowed(payload, config);
  if (notAllowed) return { reason: notAllowed };

  return { repo: payload.repository!.name!, pr: payload.pull_request?.number ?? 0, issue: target.issue };
}

function senderNotAllowed(payload: { sender?: Sender }, config: WebhookConfig): string | undefined {
  if (!config.allowedSenderIds.includes(Number(payload.sender?.id)))
    return `sender ${payload.sender?.id} is not allowed`;
  return undefined;
}

function repoNotAllowed(payload: { repository?: Repository }, config: WebhookConfig): string | undefined {
  const owner = payload.repository?.owner?.login;
  if (owner?.toLowerCase() !== config.owner.toLowerCase()) return `repository owner ${owner} is not ${config.owner}`;
  return undefined;
}

const ignore = (reason: string): WebhookAction => ({ kind: "ignore", reason });
