import { Hono } from "hono";
import type { AppConfig } from "./config.ts";
import type { IssueService } from "./contracts.ts";
import { InvalidSignatureError, verifyWebhook } from "./github/webhooks.ts";

export interface ServerDeps {
  config: AppConfig;
  service: IssueService;
  webhookSecret: string;
  log: (msg: string, data?: object) => void;
}

export function createServer({ config, service, webhookSecret, log }: ServerDeps): Hono {
  const app = new Hono();

  app.post("/webhooks/github", async (c) => {
    const rawBody = await c.req.text();
    const deliveryId = c.req.header("x-github-delivery") ?? "";
    let action;
    try {
      action = await verifyWebhook({
        event: c.req.header("x-github-event") ?? "",
        deliveryId,
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
    else await service.stop(action);
    return c.body(null, 202);
  });

  app.notFound((c) => c.text("not found", 404));
  app.onError((error, c) => {
    log("request failed", { path: c.req.path, error: error.message });
    return c.text("internal error", 500);
  });

  return app;
}
