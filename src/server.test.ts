import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { IssueService } from "./contracts.ts";
import type { IssuePhase, RunStatus } from "./runStatus.ts";
import type { WebhookConfig } from "./github/webhooks.ts";
import { createServer } from "./server.ts";
import { createUploads } from "./uploads.ts";

const secret = "test-secret";
const config: WebhookConfig = { owner: "acme", allowedSenderIds: [42] };

const uploadDirs: string[] = [];
afterAll(() => uploadDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function setup(uiDir = join(tmpdir(), "mike-factory-no-such-ui"), proxySecret?: string) {
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  const notify = () => listeners.forEach((listener) => listener());
  const service: IssueService = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    feedback: vi.fn(async () => {}),
    message: vi.fn(async () => "steered" as const),
    prState: vi.fn(async () => {}),
    sweep: vi.fn(async () => {}),
    status: vi.fn(async () => []),
    transcript: vi.fn(async () => undefined),
    subscribeStatus: vi.fn(subscribe),
    watchTranscript: vi.fn(async () => undefined),
  };
  const log = vi.fn();
  const shutdown = new AbortController();
  const uploadDir = mkdtempSync(join(tmpdir(), "uploads-"));
  uploadDirs.push(uploadDir);
  const app = createServer({
    service,
    webhook: { config, secret },
    log,
    uploads: createUploads(uploadDir),
    proxySecret,
    uiDir,
    shutdownSignal: shutdown.signal,
  });
  const post = (senderId: number, signature?: string) => {
    const body = JSON.stringify({
      action: "created",
      comment: { id: 5, body: "/mike" },
      issue: { number: 12 },
      repository: { name: "widgets", owner: { login: "acme" } },
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
  return { app, service, log, post, notify, listeners, shutdown, subscribe, uploadDir };
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
    expect(service.start).toHaveBeenCalledWith({
      kind: "start",
      repo: "widgets",
      issue: 12,
      requestId: "comment-5",
      instructions: "",
      reviewer: "",
    });
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
    expect((await app.request("/status/widgets/12/conversation")).status).toBe(404);
    expect((await app.request("/status/widgets/abc/conversation")).status).toBe(404);

    vi.mocked(service.transcript).mockResolvedValue([{ kind: "assistant", text: "Done." }]);
    const response = await app.request("/status/widgets/12/conversation");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ kind: "assistant", text: "Done." }]);
    expect(service.transcript).toHaveBeenLastCalledWith("widgets", 12);
  });

  it("serves the conversation as a JSON attachment with ?download=1", async () => {
    const { app, service } = setup();
    const transcript = [{ kind: "assistant" as const, text: "Done." }];
    vi.mocked(service.transcript).mockResolvedValue(transcript);
    const response = await app.request("/status/widgets/12/conversation?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="widgets-issue-12-conversation.json"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe(JSON.stringify(transcript, null, 2));
  });

  it("streams the full run list first, then only the changed tail", async () => {
    const { app, service, notify, listeners, shutdown } = setup();
    const run = (issue: number, phase: IssuePhase): RunStatus => ({
      repo: "widgets",
      issue,
      issueUrl: "",
      title: null,
      branch: "",
      phase,
      attempts: 0,
      costUsd: 0,
      model: null,
      thinkingLevel: null,
      prUrl: null,
      prState: null,
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
    expect((await app.request("/status/widgets/12/conversation/stream")).status).toBe(404);
    expect((await app.request("/status/widgets/abc/conversation/stream")).status).toBe(404);

    vi.mocked(service.watchTranscript).mockImplementation(async (_repo, _issue, listener) => ({
      items: async () => [{ kind: "assistant", text: "Done." }],
      stop: subscribe(listener),
    }));
    const response = await app.request("/status/widgets/12/conversation/stream");
    expect(response.status).toBe(200);
    expect(await sseEvents(response).next()).toEqual({ from: 0, items: [{ kind: "assistant", text: "Done." }] });
    expect(service.watchTranscript).toHaveBeenCalledWith("widgets", 12, expect.any(Function));
    shutdown.abort();
  });

  describe("POST /status/:repo/:issue/messages", () => {
    const id = "6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b";
    const MB = 1_000_000;
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

    const form = (fields: { id?: string; text?: string }, files: File[] = []) => {
      const body = new FormData();
      for (const [name, value] of Object.entries(fields)) if (value !== undefined) body.append(name, value);
      for (const file of files) body.append("files", file);
      return body;
    };
    const send = (
      app: ReturnType<typeof setup>["app"],
      body: FormData,
      headers: Record<string, string> = { "x-requested-with": "mike-factory" },
    ) => app.request("/status/widgets/12/messages", { method: "POST", body, headers });

    it.each([
      { fields: { id: "not-a-uuid", text: "hi" } },
      { fields: { id, text: "   " } },
      { fields: { id, text: "x".repeat(8_001) } },
      { fields: { id } },
    ])("rejects $fields with 400", async ({ fields }) => {
      const { app, service } = setup();
      expect((await send(app, form(fields))).status).toBe(400);
      expect(service.message).not.toHaveBeenCalled();
    });

    it("rejects a post without X-Requested-With, which a cross-site form can't add", async () => {
      const { app, service } = setup();
      const response = await send(app, form({ id, text: "hi" }), {});
      expect(response.status).toBe(403);
      expect(service.message).not.toHaveBeenCalled();
    });

    it("passes the message on with 202, and 404s for an unknown run", async () => {
      const { app, service, log } = setup();
      const response = await send(app, form({ id, text: "  Use tabs  " }));
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ result: "steered" });
      expect(service.message).toHaveBeenCalledWith({ repo: "widgets", issue: 12, id, text: "Use tabs" });
      expect(JSON.stringify(log.mock.calls)).not.toContain("Use tabs");

      vi.mocked(service.message).mockResolvedValue("not_found");
      expect((await send(app, form({ id, text: "hi" }))).status).toBe(404);
    });

    it.each([
      { files: 11, size: 1, status: 400, error: "at most 10 files" },
      { files: 1, size: 10 * MB + 1, status: 413, error: "f0.bin is larger than 10 MB" },
      { files: 3, size: 9 * MB, status: 413, error: "total at most 25 MB" },
    ])("rejects $files files of $size bytes with $status", async ({ files, size, status, error }) => {
      const { app, service, uploadDir } = setup();
      const attached = Array.from({ length: files }, (_, i) => new File([new Uint8Array(size)], `f${i}.bin`));

      const response = await send(app, form({ id, text: "hi" }, attached));
      expect(response.status).toBe(status);
      expect(await response.text()).toContain(error);
      expect(service.message).not.toHaveBeenCalled();
      expect(readdirSync(uploadDir)).toEqual([]);
    });

    it("stores attachments once per content and serves images inline, everything else as a download", async () => {
      const { app, service, uploadDir } = setup();
      const files = [
        new File([PNG], "../shot.png", { type: "image/png" }),
        new File(["<script>alert(1)</script>"], "page.html", { type: "text/html" }),
      ];

      expect((await send(app, form({ id, text: "See these" }, files))).status).toBe(202);
      expect((await send(app, form({ id, text: "See these" }, files))).status).toBe(202);
      expect(readdirSync(join(uploadDir, "widgets", "12"))).toHaveLength(2);

      const { attachments } = vi.mocked(service.message).mock.calls[0]![0];
      expect(attachments).toEqual([
        { id: expect.stringMatching(/^[0-9a-f]{64}$/), name: "shot.png", type: "image/png", size: PNG.length },
        { id: expect.stringMatching(/^[0-9a-f]{64}$/), name: "page.html", type: "application/octet-stream", size: 25 },
      ]);

      const [image, page] = await Promise.all(
        attachments!.map(({ id, name }) =>
          app.request(`/status/widgets/12/attachments/${id}/${encodeURIComponent(name)}`),
        ),
      );
      expect(new Uint8Array(await image!.arrayBuffer())).toEqual(PNG);
      expect(Object.fromEntries(image!.headers)).toMatchObject({
        "content-type": "image/png",
        "content-disposition": "inline; filename*=UTF-8''shot.png",
        "x-content-type-options": "nosniff",
      });
      expect(Object.fromEntries(page!.headers)).toMatchObject({
        "content-type": "application/octet-stream",
        "content-disposition": "attachment; filename*=UTF-8''page.html",
        "x-content-type-options": "nosniff",
      });

      expect((await app.request(`/status/widgets/13/attachments/${attachments![0]!.id}/shot.png`)).status).toBe(404);
    });
  });

  it("with a proxy secret, rejects requests that don't carry it, except the webhook", async () => {
    const { app, post } = setup(undefined, "proxy-secret");
    const status = (headers?: Record<string, string>) => app.request("/status", { headers });
    expect((await status()).status).toBe(401);
    expect((await status({ "x-proxy-secret": "proxy-secre" })).status).toBe(401);
    expect((await status({ "x-proxy-secret": "proxy-secret" })).status).toBe(200);
    expect((await post(42)).status).toBe(202);
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
