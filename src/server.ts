import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type { IssueService } from "./contracts.ts";
import { InvalidSignatureError, verifyWebhook, type WebhookConfig } from "./github/webhooks.ts";
import { ATTACHMENT_LIMITS } from "./runStatus.ts";
import { isRepoName, servedType, type Uploads } from "./uploads.ts";

export interface ServerDeps {
  service: IssueService;
  /** Serves `/webhooks/github`; without it the server has no GitHub integration. */
  webhook?: { config: WebhookConfig; secret: string };
  log: (msg: string, data?: object) => void;
  uploads: Uploads;
  /** When set, every request except the webhook must carry it in `X-Proxy-Secret`, which the reverse proxy adds. */
  proxySecret?: string;
  uiDir?: string;
  /** Ends open live streams so `server.close()` can finish. */
  shutdownSignal?: AbortSignal;
}

const THROTTLE_MS = 500;
const MAX_MESSAGE_CHARS = 8_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORM_OVERHEAD_BYTES = 64 * 1024;
const PING_MS = 20_000;
const RETRY_MS = 5_000;

const DEFAULT_UI_DIR = fileURLToPath(new URL("../web/dist", import.meta.url));

// Hashed so `timingSafeEqual` compares equal lengths without leaking the secret's length.
const digest = (value: string) => createHash("sha256").update(value).digest();

const megabytes = (bytes: number) => `${bytes / 1_000_000} MB`;

const rfc5987 = (value: string) =>
  encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

// A custom header makes browsers preflight a cross-site request, which this server never allows, so no other site
// can post a message, not even as a form.
const REQUESTED_WITH = "mike-factory";
const sameSiteOnly: MiddlewareHandler = async (c, next) => {
  if (c.req.header("x-requested-with") !== REQUESTED_WITH) return c.text("missing X-Requested-With", 403);
  return next();
};

export function createServer({
  service,
  webhook,
  log,
  uploads,
  proxySecret,
  uiDir = DEFAULT_UI_DIR,
  shutdownSignal,
}: ServerDeps): Hono {
  const app = new Hono();

  if (proxySecret) {
    const expected = digest(proxySecret);
    app.use("*", async (c, next) => {
      if (c.req.path === "/webhooks/github") return next();
      if (!timingSafeEqual(digest(c.req.header("x-proxy-secret") ?? ""), expected)) return c.text("unauthorized", 401);
      return next();
    });
  }

  /**
   * Streams `{ from, items }` events: the full list first, then only the tail from the first item that changed.
   * Responds 404 when `watch` returns undefined, and stops the watch when the stream ends.
   */
  const liveList = async <T>(
    c: Context,
    watch: (onChange: () => void) => Promise<{ items(): Promise<T[]>; stop(): void } | undefined>,
  ) => {
    let wake = () => {};
    let changed = false;
    const live = await watch(() => {
      changed = true;
      wake();
    });
    if (!live) return c.text("not found", 404);

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
            const items = (await live.items()).map((item) => JSON.stringify(item));

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
          live.stop();
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

  if (webhook)
    app.post("/webhooks/github", async (c) => {
      const rawBody = await c.req.text();
      const deliveryId = c.req.header("x-github-delivery") ?? "";

      let action;
      try {
        action = await verifyWebhook({
          event: c.req.header("x-github-event") ?? "",
          signature: c.req.header("x-hub-signature-256") ?? "",
          rawBody,
          secret: webhook.secret,
          config: webhook.config,
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
      else if (action.kind === "stop" || action.kind === "pr-stop") await service.stop(action);
      else if (action.kind === "feedback") await service.feedback(action);
      else await service.prState(action);
      return c.body(null, 202);
    });

  app.post(
    "/status/:repo/:issue/messages",
    sameSiteOnly,
    bodyLimit({
      maxSize: ATTACHMENT_LIMITS.totalBytes + FORM_OVERHEAD_BYTES,
      onError: (c) => c.text(`Files can total at most ${megabytes(ATTACHMENT_LIMITS.totalBytes)}`, 413),
    }),
    async (c) => {
      const repo = c.req.param("repo");
      const issue = Number(c.req.param("issue"));
      if (!Number.isInteger(issue) || !isRepoName(repo)) return c.text("not found", 404);

      const form = await c.req.formData().catch(() => undefined);
      const id = form?.get("id");
      const text = form?.get("text");
      const files = (form?.getAll("files") ?? []).filter((file) => file instanceof File);

      if (typeof id !== "string" || !UUID.test(id)) return c.text("id must be a UUID", 400);
      if (typeof text !== "string" || !text.trim() || text.length > MAX_MESSAGE_CHARS)
        return c.text(`text must be 1 to ${MAX_MESSAGE_CHARS} characters`, 400);

      if (files.length > ATTACHMENT_LIMITS.count)
        return c.text(`A message can carry at most ${ATTACHMENT_LIMITS.count} files`, 400);

      const tooLarge = files.find((file) => file.size > ATTACHMENT_LIMITS.fileBytes);
      if (tooLarge) return c.text(`${tooLarge.name} is larger than ${megabytes(ATTACHMENT_LIMITS.fileBytes)}`, 413);

      if (files.reduce((total, file) => total + file.size, 0) > ATTACHMENT_LIMITS.totalBytes)
        return c.text(`Files can total at most ${megabytes(ATTACHMENT_LIMITS.totalBytes)}`, 413);

      const attachments = await Promise.all(files.map((file) => uploads.save(repo, issue, file)));
      const result = await service.message({
        repo,
        issue,
        id,
        text: text.trim(),
        ...(attachments.length > 0 && { attachments }),
      });
      log("message received", { repo, issue, id, result, attachments: attachments.length });

      if (result === "not_found") return c.text("not found", 404);
      return c.json({ result }, 202);
    },
  );

  app.get("/status/:repo/:issue/attachments/:id/:name", async (c) => {
    const issue = Number(c.req.param("issue"));
    const bytes = Number.isInteger(issue) && (await uploads.read(c.req.param("repo"), issue, c.req.param("id")));
    if (!bytes) return c.text("not found", 404);

    const type = servedType(bytes);
    const disposition = type.startsWith("image/") ? "inline" : "attachment";

    return c.body(new Uint8Array(bytes), 200, {
      "Content-Type": type,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${rfc5987(c.req.param("name"))}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    });
  });

  app.get("/status", async (c) => c.json(await service.status()));

  app.get("/status/stream", (c) =>
    liveList(c, async (onChange) => ({ items: () => service.status(), stop: service.subscribeStatus(onChange) })),
  );

  app.get("/status/:repo/:issue/conversation/stream", async (c) => {
    const repo = c.req.param("repo");
    const issue = Number(c.req.param("issue"));
    if (!Number.isInteger(issue)) return c.text("not found", 404);
    return liveList(c, (onChange) => service.watchTranscript(repo, issue, onChange));
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
