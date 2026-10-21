import { Webhooks } from "@octokit/webhooks";
import type { AppConfig } from "../config.ts";
import type { WebhookAction } from "../contracts.ts";

export class InvalidSignatureError extends Error {
  constructor() {
    super("invalid webhook signature");
    this.name = "InvalidSignatureError";
  }
}

interface IssueCommentPayload {
  action?: string;
  comment?: { id?: number; body?: string };
  issue?: { number?: number; pull_request?: unknown };
  sender?: { id?: number };
  repository?: { name?: string; owner?: { login?: string } };
}

interface PullRequestPayload {
  action?: string;
  pull_request?: { head?: { ref?: string; repo?: { full_name?: string } | null } };
  repository?: { name?: string; full_name?: string; owner?: { login?: string } };
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
  config: AppConfig;
}): Promise<WebhookAction> {
  const { event, signature, rawBody, secret, config } = input;
  const valid = signature ? await new Webhooks({ secret }).verify(rawBody, signature).catch(() => false) : false;
  if (!valid) throw new InvalidSignatureError();

  if (event !== "issue_comment" && event !== "pull_request") return ignore(`event ${event} is not handled`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return ignore("payload is not valid JSON");
  }
  if (event === "pull_request") return pullRequestAction(parsed as PullRequestPayload, config);

  const payload = parsed as IssueCommentPayload;
  if (payload.action !== "created") return ignore(`issue_comment action ${payload.action} is not handled`);
  if (payload.issue?.pull_request) return ignore("comment is on a pull request");

  const command = parseCommand(payload.comment?.body ?? "");
  if (!command) return ignore("comment is not a /mike command");

  const issue = payload.issue?.number;
  const repo = payload.repository?.name;
  const commentId = payload.comment?.id;
  if (typeof issue !== "number" || typeof commentId !== "number" || !repo) return ignore("payload has no issue number, comment id or repository");

  if (Number(payload.sender?.id) !== config.allowedSenderId) return ignore(`sender ${payload.sender?.id} is not allowed`);

  const notAllowed = repoNotAllowed(payload, config);
  if (notAllowed) return ignore(notAllowed);

  return { ...command, repo, issue, requestId: `comment-${commentId}` };
}

function pullRequestAction(payload: PullRequestPayload, config: AppConfig): WebhookAction {
  if (payload.action !== "closed") return ignore(`pull_request action ${payload.action} is not handled`);
  const head = payload.pull_request?.head;
  const match = /^agent\/issue-(\d+)$/.exec(head?.ref ?? "");
  if (!match) return ignore(`branch ${head?.ref} is not an agent branch`);
  // A fork can name its branch agent/issue-<n> too.
  if (head?.repo?.full_name !== payload.repository?.full_name) return ignore("pull request comes from a fork");
  const notAllowed = repoNotAllowed(payload, config);
  if (notAllowed) return ignore(notAllowed);
  return { kind: "cleanup", repo: payload.repository!.name!, issue: Number(match[1]) };
}

function repoNotAllowed(payload: { repository?: { name?: string; owner?: { login?: string } } }, config: AppConfig): string | undefined {
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  if (owner?.toLowerCase() !== config.owner.toLowerCase()) return `repository owner ${owner} is not ${config.owner}`;
  if (!config.repos.some((r) => r.name === repo)) return `repository ${repo} is not in repos.yaml`;
  return undefined;
}

const ignore = (reason: string): WebhookAction => ({ kind: "ignore", reason });
