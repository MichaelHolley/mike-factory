import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.ts";
import type { IssueService } from "./contracts.ts";
import type { RunStatus } from "./runStatus.ts";
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

function setup(uiDir = join(tmpdir(), "mike-factory-no-such-ui")) {
  const service: IssueService = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {}),
    sweep: vi.fn(async () => {}),
    status: vi.fn(async () => []),
    transcript: vi.fn(async () => undefined),
  };
  const log = vi.fn();
  const app = createServer({ config, service, webhookSecret: secret, log, uiDir });
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

  it("serves the issue states on /status", async () => {
    const { app } = setup();
    const response = await app.request("/status");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("serves only the public projection on /status", async () => {
    const { app, service } = setup();
    const run: RunStatus = {
      repo: "byok-imagen",
      issue: 12,
      issueUrl: "https://github.com/michaelholley/byok-imagen/issues/12",
      branch: "agent/issue-12",
      phase: "done",
      attempts: 1,
      costUsd: 0.5,
      prUrl: "https://github.com/michaelholley/byok-imagen/pull/13",
      lastError: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: null,
    };
    vi.mocked(service.status).mockResolvedValue([run]);
    expect(await (await app.request("/status")).json()).toEqual([run]);
  });

  it("serves a run's conversation, and 404s when there is none", async () => {
    const { app, service } = setup();
    expect((await app.request("/status/byok-imagen/12/conversation")).status).toBe(404);
    expect((await app.request("/status/byok-imagen/abc/conversation")).status).toBe(404);

    vi.mocked(service.transcript).mockResolvedValue([{ kind: "assistant", text: "Done." }]);
    const response = await app.request("/status/byok-imagen/12/conversation");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ kind: "assistant", text: "Done." }]);
    expect(service.transcript).toHaveBeenLastCalledWith("byok-imagen", 12);
  });

  it("downloads a fresh public conversation snapshot as a JSON attachment", async () => {
    const { app, service } = setup();
    const transcript = [
      { kind: "user" as const, text: "Implement this.\nKeep Unicode: ✓" },
      { kind: "assistant" as const, text: "Working on it." },
      { kind: "tool" as const, name: "bash", summary: "pnpm test", args: '{"command":"pnpm test"}', result: { text: "Passed", isError: false } },
      { kind: "tool" as const, name: "read", summary: "README.md", args: '{"path":"README.md"}' },
    ];
    vi.mocked(service.transcript).mockResolvedValueOnce([]).mockResolvedValueOnce(transcript);
    const url = "/status/byok-imagen/12/conversation?download=1";
    const empty = await app.request(url);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    const response = await app.request(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="byok-imagen-issue-12-conversation.json"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe(JSON.stringify(transcript, null, 2));
    expect(service.transcript).toHaveBeenLastCalledWith("byok-imagen", 12);
  });

  it("does not download a file for missing or invalid conversations", async () => {
    const { app } = setup();
    for (const issue of ["12", "abc"]) {
      const response = await app.request(`/status/byok-imagen/${issue}/conversation?download=1`);
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Disposition")).toBeNull();
    }
  });

  it("returns 404 for everything else", async () => {
    const { app } = setup();
    expect((await app.request("/")).status).toBe(404);
    expect((await app.request("/webhooks/github")).status).toBe(404);
  });
});

describe("web UI", () => {
  let uiDir: string | undefined;
  afterEach(() => {
    if (uiDir) rmSync(uiDir, { recursive: true, force: true });
    uiDir = undefined;
  });

  function builtUi() {
    uiDir = mkdtempSync(join(tmpdir(), "ui-"));
    mkdirSync(join(uiDir, "assets"));
    writeFileSync(join(uiDir, "index.html"), "<!doctype html><title>runs</title>");
    writeFileSync(join(uiDir, "assets", "app.js"), "console.log(1)");
    return uiDir;
  }

  it("serves index.html for client routes and files under /assets", async () => {
    const { app } = setup(builtUi());
    const page = await app.request("/runs/x/1");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>runs</title>");
    expect(await (await app.request("/assets/app.js")).text()).toBe("console.log(1)");
  });

  it("keeps the webhook and /status routes ahead of the UI", async () => {
    const { app, post, service } = setup(builtUi());
    expect((await post(42)).status).toBe(202);
    expect(service.start).toHaveBeenCalled();
    expect(await (await app.request("/status")).json()).toEqual([]);
  });
});
