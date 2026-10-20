import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config.ts";
import { InvalidSignatureError, verifyWebhook } from "./webhooks.ts";

const secret = "s3cret";
const config: AppConfig = {
  owner: "michaelholley",
  allowedSenderId: 42,
  repos: [{ name: "byok-imagen", defaultBranch: "main", model: { provider: "p", modelId: "m" }, maxTurns: 1, maxCostUsd: 1, maxFixAttempts: 1 }],
};

const payload = (overrides: Record<string, unknown> = {}) => ({
  action: "labeled",
  label: { name: "agent:ready" },
  issue: { number: 12 },
  sender: { id: 42 },
  repository: { name: "byok-imagen", owner: { login: "MichaelHolley" } },
  ...overrides,
});

const sign = (body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const run = (body: unknown, { event = "issues", signature }: { event?: string; signature?: string } = {}) => {
  const rawBody = JSON.stringify(body);
  return verifyWebhook({ event, deliveryId: "d-1", signature: signature ?? sign(rawBody), rawBody, secret, config });
};

describe("verifyWebhook", () => {
  it("rejects a bad or missing signature", async () => {
    await expect(run(payload(), { signature: "sha256=deadbeef" })).rejects.toBeInstanceOf(InvalidSignatureError);
    await expect(run(payload(), { signature: "" })).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("starts on agent:ready and stops on agent:stop", async () => {
    expect(await run(payload())).toEqual({ kind: "start", repo: "byok-imagen", issue: 12, deliveryId: "d-1" });
    expect(await run(payload({ label: { name: "agent:stop" } }))).toEqual({ kind: "stop", repo: "byok-imagen", issue: 12, deliveryId: "d-1" });
  });

  it.each([
    ["other event", payload(), { event: "pull_request" }, /event/],
    ["other action", payload({ action: "unlabeled" }), {}, /action/],
    ["other label", payload({ label: { name: "bug" } }), {}, /label/],
    ["wrong sender", payload({ sender: { id: 7 } }), {}, /sender/],
    ["wrong owner", payload({ repository: { name: "byok-imagen", owner: { login: "someone" } } }), {}, /owner/],
    ["unlisted repo", payload({ repository: { name: "other", owner: { login: "michaelholley" } } }), {}, /repos\.yaml/],
  ])("ignores %s", async (_name, body, opts, reason) => {
    const action = await run(body, opts);
    expect(action.kind).toBe("ignore");
    expect(action.kind === "ignore" && action.reason).toMatch(reason);
  });
});
