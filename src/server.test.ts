import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.ts";
import type { IssueService } from "./contracts.ts";
import type { IssuePhase, RunStatus } from "./runStatus.ts";
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
      thinkingLevel: "high",
      maxFixAttempts: 2,
    },
  ],
};

function setup(uiDir = join(tmpdir(), "mike-factory-no-such-ui")) {
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  const notify = () => listeners.forEach((listener) => listener());
  const service: IssueService = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {}),
    sweep: vi.fn(async () => {}),
    status: vi.fn(async () => []),
    transcript: vi.fn(async () => undefined),
    subscribeStatus: vi.fn(subscribe),
    subscribeTranscript: vi.fn(async () => undefined),
  };
  const log = vi.fn();
  const shutdown = new AbortController();
  const app = createServer({ config, service, webhookSecret: secret, log, uiDir, shutdownSignal: shutdown.signal });
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
  return { app, service, log, post, notify, listeners, shutdown, subscribe };
}

/** Reads `data:` events from an SSE response, one per call. */
function sseEvents(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  return {
    async next(): Promise<unknown> {
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block.split("\n").find((line) => line.startsWith("data: "));
          if (data) return JSON.parse(data.slice("data: ".length));
          continue;
        }
        const { done, value } = await reader.read();
        if (done) return undefined;
        buffer += value;
      }
    },
  };
}

describe("webhook server", () => {
  it("starts the issue for a valid signed event", async () => {
    const { post, service } = setup();
    expect((await post(42)).status).toBe(202);
    expect(service.start).toHaveBeenCalledWith({ kind: "start", repo: "byok-imagen", issue: 12, requestId: "comment-5", instructions: "" });
  });

  it("acknowledges ignored events with 202 and rejects bad signatures with 401", async () => {
    const { post, service, log } = setup();
    expect((await post(7)).status).toBe(202);
    expect(log).toHaveBeenCalledWith("webhook ignored", expect.objectContaining({ deliveryId: "delivery-1" }));
    expect((await post(42, "sha256=deadbeef")).status).toBe(401);
    expect(service.start).not.toHaveBeenCalled();
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

  it("serves the conversation as a JSON attachment with ?download=1", async () => {
    const { app, service } = setup();
    const transcript = [{ kind: "assistant" as const, text: "Done." }];
    vi.mocked(service.transcript).mockResolvedValue(transcript);
    const response = await app.request("/status/byok-imagen/12/conversation?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="byok-imagen-issue-12-conversation.json"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe(JSON.stringify(transcript, null, 2));
  });

  it("streams the full run list first, then only the changed tail", async () => {
    const { app, service, notify, listeners, shutdown } = setup();
    const run = (issue: number, phase: IssuePhase): RunStatus => ({
      repo: "byok-imagen",
      issue,
      issueUrl: "",
      branch: "",
      phase,
      attempts: 0,
      costUsd: 0,
      prUrl: null,
      lastError: null,
      startedAt: null,
      updatedAt: null,
    });
    vi.mocked(service.status).mockResolvedValue([run(1, "done"), run(2, "queued")]);
    const response = await app.request("/status/stream");
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(response.headers.get("Connection")).toBe("close");
    const events = sseEvents(response);
    expect(await events.next()).toEqual({ from: 0, items: [run(1, "done"), run(2, "queued")] });

    notify();
    await vi.waitFor(() => expect(service.status).toHaveBeenCalledTimes(2));
    vi.mocked(service.status).mockResolvedValue([run(1, "done"), run(2, "implement"), run(3, "queued")]);
    notify();
    expect(await events.next()).toEqual({ from: 1, items: [run(2, "implement"), run(3, "queued")] });

    vi.mocked(service.status).mockResolvedValue([run(1, "done")]);
    notify();
    expect(await events.next()).toEqual({ from: 1, items: [] });

    shutdown.abort();
    expect(await events.next()).toBeUndefined();
    expect(listeners.size).toBe(0);
  });

  it("ends the stream and unsubscribes when the client is gone before it starts", async () => {
    const { app, listeners } = setup();
    const gone = new AbortController();
    gone.abort();
    await app.request(new Request("http://localhost/status/stream", { signal: gone.signal }));
    await vi.waitFor(() => expect(listeners.size).toBe(0));
  });

  it("streams a run's conversation, and 404s when there is none", async () => {
    const { app, service, subscribe, shutdown } = setup();
    expect((await app.request("/status/byok-imagen/12/conversation/stream")).status).toBe(404);
    expect((await app.request("/status/byok-imagen/abc/conversation/stream")).status).toBe(404);

    vi.mocked(service.subscribeTranscript).mockImplementation(async (_repo, _issue, listener) => subscribe(listener));
    vi.mocked(service.transcript).mockResolvedValue([{ kind: "assistant", text: "Done." }]);
    const response = await app.request("/status/byok-imagen/12/conversation/stream");
    expect(response.status).toBe(200);
    expect(await sseEvents(response).next()).toEqual({ from: 0, items: [{ kind: "assistant", text: "Done." }] });
    expect(service.subscribeTranscript).toHaveBeenCalledWith("byok-imagen", 12, expect.any(Function));
    shutdown.abort();
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
