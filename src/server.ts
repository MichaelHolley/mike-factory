import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { AppConfig } from "./config.ts";
import type { IssueService } from "./contracts.ts";
import { InvalidSignatureError, verifyWebhook } from "./github/webhooks.ts";

export interface ServerDeps {
  config: AppConfig;
  service: IssueService;
  webhookSecret: string;
  log: (msg: string, data?: object) => void;
  uiDir?: string;
}

const DEFAULT_UI_DIR = fileURLToPath(new URL("../web/dist", import.meta.url));

export function createServer({ config, service, webhookSecret, log, uiDir = DEFAULT_UI_DIR }: ServerDeps): Hono {
  const app = new Hono();

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

  app.get("/status", async (c) => c.json(await service.status()));

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
