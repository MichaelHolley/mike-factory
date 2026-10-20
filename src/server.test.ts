import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.ts";
import type { IssueService } from "./contracts.ts";
import { createServer } from "./server.ts";

const secret = "test-secret";
const config: AppConfig = {
  owner: "michaelholley",
  allowedSenderId: 42,
  repos: [
    {
      name: "byok-imagen",
      defaultBranch: "main",
      model: { provider: "openai", modelId: "gpt-6.1-sol" },
      maxTurns: 10,
      maxCostUsd: 1,
      maxFixAttempts: 2,
    },
  ],
};

function setup() {
  const service: IssueService = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const log = vi.fn();
  const app = createServer({ config, service, webhookSecret: secret, log });
  const post = (senderId: number, signature?: string) => {
    const body = JSON.stringify({
      action: "created",
      comment: { id: 5, body: "/mike" },
      issue: { number: 12 },
      repository: { name: "byok-imagen", owner: { login: "michaelholley" } },
      sender: { id: senderId },
    });
    return app.request("/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "x-github-event": "issue_comment",
        "x-github-delivery": "delivery-1",
        "x-hub-signature-256": signature ?? `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
      },
    });
  };
  return { app, service, log, post };
}

describe("webhook server", () => {
  it("starts the issue for a valid signed event", async () => {
    const { post, service } = setup();
    expect((await post(42)).status).toBe(202);
    expect(service.start).toHaveBeenCalledWith({ kind: "start", repo: "byok-imagen", issue: 12, requestId: "comment-5", instructions: "" });
  });

  it("acknowledges but ignores other senders", async () => {
    const { post, service, log } = setup();
    expect((await post(7)).status).toBe(202);
    expect(service.start).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("webhook ignored", expect.objectContaining({ deliveryId: "delivery-1" }));
  });

  it("rejects a bad signature", async () => {
    const { post, service } = setup();
    expect((await post(42, "sha256=deadbeef")).status).toBe(401);
    expect(service.start).not.toHaveBeenCalled();
  });

  it("returns 404 for everything else", async () => {
    const { app } = setup();
    expect((await app.request("/status")).status).toBe(404);
    expect((await app.request("/webhooks/github")).status).toBe(404);
  });
});
