import { Webhooks } from "@octokit/webhooks";
import type { AppConfig } from "../config.ts";
import type { WebhookAction } from "../contracts.ts";

export class InvalidSignatureError extends Error {
  constructor() {
    super("invalid webhook signature");
    this.name = "InvalidSignatureError";
  }
}

interface LabeledIssuePayload {
  action?: string;
  label?: { name?: string };
  issue?: { number?: number };
  sender?: { id?: number };
  repository?: { name?: string; owner?: { login?: string } };
}

const ACTION_BY_LABEL = { "agent:ready": "start", "agent:stop": "stop" } as const;

export async function verifyWebhook(input: {
  event: string;
  deliveryId: string;
  signature: string;
  rawBody: string;
  secret: string;
  config: AppConfig;
}): Promise<WebhookAction> {
  const { event, deliveryId, signature, rawBody, secret, config } = input;
  const valid = signature ? await new Webhooks({ secret }).verify(rawBody, signature).catch(() => false) : false;
  if (!valid) throw new InvalidSignatureError();

  if (event !== "issues") return ignore(`event ${event} is not handled`);

  let payload: LabeledIssuePayload;
  try {
    payload = JSON.parse(rawBody) as LabeledIssuePayload;
  } catch {
    return ignore("payload is not valid JSON");
  }
  if (payload.action !== "labeled") return ignore(`issues action ${payload.action} is not handled`);

  const label = payload.label?.name ?? "";
  const kind = ACTION_BY_LABEL[label as keyof typeof ACTION_BY_LABEL];
  if (!kind) return ignore(`label ${label} is not a trigger`);

  const issue = payload.issue?.number;
  const repo = payload.repository?.name;
  if (typeof issue !== "number" || !repo) return ignore("payload has no issue number or repository");

  if (Number(payload.sender?.id) !== config.allowedSenderId) return ignore(`sender ${payload.sender?.id} is not allowed`);

  const owner = payload.repository?.owner?.login;
  if (owner?.toLowerCase() !== config.owner.toLowerCase()) return ignore(`repository owner ${owner} is not ${config.owner}`);
  if (!config.repos.some((r) => r.name === repo)) return ignore(`repository ${repo} is not in repos.yaml`);

  return { kind, repo, issue, deliveryId };
}

const ignore = (reason: string): WebhookAction => ({ kind: "ignore", reason });
