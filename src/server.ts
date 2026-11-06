import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppConfig } from "./config.ts";
import type { IssueService } from "./contracts.ts";
import { InvalidSignatureError, verifyWebhook } from "./github/webhooks.ts";

export interface ServerDeps {
  config: AppConfig;
  service: IssueService;
  webhookSecret: string;
  log: (msg: string, data?: object) => void;
  uiDir?: string;
  /** Ends open live streams so `server.close()` can finish. */
  shutdownSignal?: AbortSignal;
}

const THROTTLE_MS = 500;
const MAX_MESSAGE_CHARS = 8_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PING_MS = 20_000;
const RETRY_MS = 5_000;

const DEFAULT_UI_DIR = fileURLToPath(new URL("../web/dist", import.meta.url));

export function createServer({
  config,
  service,
  webhookSecret,
  log,
  uiDir = DEFAULT_UI_DIR,
  shutdownSignal,
}: ServerDeps): Hono {
  const app = new Hono();

  /**
   * Streams `{ from, items }` events: the full list first, then only the tail from the first item that changed.
   * Responds 404 when `subscribe` returns undefined.
   */
  const liveList = async <T>(
    c: Context,
    load: () => Promise<T[]>,
    subscribe: (onChange: () => void) => Promise<(() => void) | undefined>,
  ) => {
    let wake = () => {};
    let changed = false;
    const unsubscribe = await subscribe(() => {
      changed = true;
      wake();
    });
    if (!unsubscribe) return c.text("not found", 404);

    c.header("X-Accel-Buffering", "no");
    const response = streamSSE(
      c,
      async (stream) => {
        const ended = () => stream.aborted || c.req.raw.signal.aborted || shutdownSignal?.aborted === true;
        const end = () => {
          stream.abort();
          wake();
        };
        stream.onAbort(end);
        // On Node, `onAbort` misses clients that leave before the response body is read.
        c.req.raw.signal.addEventListener("abort", end);
        shutdownSignal?.addEventListener("abort", end);
        const ping = setInterval(() => void stream.write(": ping\n\n"), PING_MS);
        let sent: string[] | undefined;
        try {
          while (!ended()) {
            changed = false;
            const loadedAt = Date.now();
            const items = (await load()).map((item) => JSON.stringify(item));
            let from = 0;
            while (sent && from < items.length && items[from] === sent[from]) from++;
            if (!sent || from < Math.max(items.length, sent.length)) {
              await stream.writeSSE({
                data: `{"from":${from},"items":[${items.slice(from).join(",")}]}`,
                retry: sent ? undefined : RETRY_MS,
              });
            }
            sent = items;
            if (!changed && !ended()) await new Promise<void>((resolve) => (wake = resolve));
            if (ended()) break;
            await stream.sleep(Math.max(0, loadedAt + THROTTLE_MS - Date.now()));
          }
        } finally {
          clearInterval(ping);
          unsubscribe();
          c.req.raw.signal.removeEventListener("abort", end);
          shutdownSignal?.removeEventListener("abort", end);
        }
      },
      async (error) => log("live stream failed", { path: c.req.path, error: error.message }),
    );
    // A kept-alive socket left over after shutdown aborts the stream would hold `server.close()` until its keep-alive timeout.
    response.headers.set("Connection", "close");
    return response;
  };

  app.post("/webhooks/github", async (c) => {
    const rawBody = await c.req.text();
    const deliveryId = c.req.header("x-github-delivery") ?? "";
    let action;
    try {
      action = await verifyWebhook({
        event: c.req.header("x-github-event") ?? "",
        signature: c.req.header("x-hub-signature-256") ?? "",
        rawBody,
        secret: webhookSecret,
        config,
      });
    } catch (error) {
      if (error instanceof InvalidSignatureError) {
        log("webhook rejected", { deliveryId, reason: "invalid signature" });
        return c.text("invalid signature", 401);
      }
      throw error;
    }

    if (action.kind === "ignore") log("webhook ignored", { deliveryId, reason: action.reason });
    else if (action.kind === "start") await service.start(action);
    else if (action.kind === "stop") await service.stop(action);
    else await service.cleanup(action);
    return c.body(null, 202);
  });

  app.post("/status/:repo/:issue/messages", async (c) => {
    const repo = c.req.param("repo");
    const issue = Number(c.req.param("issue"));
    if (!Number.isInteger(issue)) return c.text("not found", 404);
    // Browsers can't send JSON cross-site without a CORS preflight, which this server never allows.
    if (!/^application\/json\b/i.test(c.req.header("content-type") ?? ""))
      return c.text("expected application/json", 415);
    const body = (await c.req.json().catch(() => undefined)) as { id?: unknown; text?: unknown } | undefined;
    const { id, text } = body ?? {};
    if (typeof id !== "string" || !UUID.test(id)) return c.text("id must be a UUID", 400);
    if (typeof text !== "string" || !text.trim() || text.length > MAX_MESSAGE_CHARS)
      return c.text(`text must be 1 to ${MAX_MESSAGE_CHARS} characters`, 400);
    const result = await service.message({ repo, issue, id, text: text.trim() });
    log("message received", { repo, issue, id, result });
    if (result === "not_found") return c.text("not found", 404);
    return c.json({ result }, 202);
  });

  app.get("/status", async (c) => c.json(await service.status()));

  app.get("/status/stream", (c) =>
    liveList(
      c,
      () => service.status(),
      async (onChange) => service.subscribeStatus(onChange),
    ),
  );

  app.get("/status/:repo/:issue/conversation/stream", async (c) => {
    const repo = c.req.param("repo");
    const issue = Number(c.req.param("issue"));
    if (!Number.isInteger(issue)) return c.text("not found", 404);
    return liveList(
      c,
      async () => (await service.transcript(repo, issue)) ?? [],
      (onChange) => service.subscribeTranscript(repo, issue, onChange),
    );
  });

  app.get("/status/:repo/:issue/conversation", async (c) => {
    const issue = Number(c.req.param("issue"));
    if (!Number.isInteger(issue)) return c.text("not found", 404);
    const transcript = await service.transcript(c.req.param("repo"), issue);
    if (!transcript) return c.text("not found", 404);
    if (c.req.query("download") === "1") {
      const repo = c.req.param("repo").replace(/[^a-zA-Z0-9._-]/g, "_");
      c.header("Content-Disposition", `attachment; filename="${repo}-issue-${issue}-conversation.json"`);
      c.header("Cache-Control", "no-store");
      return c.body(JSON.stringify(transcript, null, 2), 200, { "Content-Type": "application/json; charset=UTF-8" });
    }
    return c.json(transcript);
  });

  if (existsSync(uiDir)) {
    app.use("/assets/*", serveStatic({ root: uiDir }));
    app.get("*", serveStatic({ root: uiDir, path: "index.html" }));
  }

  app.notFound((c) => c.text("not found", 404));
  app.onError((error, c) => {
    log("request failed", { path: c.req.path, error: error.message });
    return c.text("internal error", 500);
  });

  return app;
}
