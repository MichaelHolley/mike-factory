import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config.ts";
import { InvalidSignatureError, parseCommand, verifyWebhook } from "./webhooks.ts";

const secret = "s3cret";
const config: AppConfig = {
  owner: "michaelholley",
  allowedSenderId: 42,
  repos: [{ name: "byok-imagen", defaultBranch: "main", model: { provider: "p", modelId: "m" }, maxTurns: 1, maxCostUsd: 1, maxFixAttempts: 1 }],
};

const payload = (overrides: Record<string, unknown> = {}) => ({
  action: "created",
  comment: { id: 99, body: "/mike" },
  issue: { number: 12 },
  sender: { id: 42 },
  repository: { name: "byok-imagen", owner: { login: "MichaelHolley" } },
  ...overrides,
});

const sign = (body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const run = (body: unknown, { event = "issue_comment", signature }: { event?: string; signature?: string } = {}) => {
  const rawBody = JSON.stringify(body);
  return verifyWebhook({ event, signature: signature ?? sign(rawBody), rawBody, secret, config });
};

describe("verifyWebhook", () => {
  it("rejects a bad or missing signature", async () => {
    await expect(run(payload(), { signature: "sha256=deadbeef" })).rejects.toBeInstanceOf(InvalidSignatureError);
    await expect(run(payload(), { signature: "" })).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("starts on /mike and stops on /mike stop, keyed by the comment id", async () => {
    expect(await run(payload())).toEqual({ kind: "start", repo: "byok-imagen", issue: 12, requestId: "comment-99", instructions: "" });
    expect(await run(payload({ comment: { id: 99, body: "/mike stop" } }))).toEqual({ kind: "stop", repo: "byok-imagen", issue: 12, requestId: "comment-99" });
  });

  it.each([
    ["/mike", { kind: "start", instructions: "" }],
    ["\n  /MIKE  use zod\nand keep it small\n", { kind: "start", instructions: "use zod\nand keep it small" }],
    ["/mike\r\nonly the API part", { kind: "start", instructions: "only the API part" }],
    ["/mike Stop", { kind: "stop" }],
    ["/mike stop the flakes", { kind: "start", instructions: "stop the flakes" }],
    ["/mikex", undefined],
    ["@mike please", undefined],
    ["thanks!\n/mike", undefined],
  ])("parses %j", (body, expected) => {
    expect(parseCommand(body)).toEqual(expected);
  });

  it.each([
    ["other event", payload(), { event: "issues" }, /event/],
    ["edited comment", payload({ action: "edited" }), {}, /action/],
    ["pull request comment", payload({ issue: { number: 12, pull_request: {} } }), {}, /pull request/],
    ["non-command comment", payload({ comment: { id: 99, body: "looks good" } }), {}, /command/],
    ["comment from another sender or the bot", payload({ sender: { id: 7 } }), {}, /sender/],
    ["wrong owner", payload({ repository: { name: "byok-imagen", owner: { login: "someone" } } }), {}, /owner/],
    ["unlisted repo", payload({ repository: { name: "other", owner: { login: "michaelholley" } } }), {}, /repos\.yaml/],
  ])("ignores %s", async (_name, body, opts, reason) => {
    const action = await run(body, opts);
    expect(action.kind).toBe("ignore");
    expect(action.kind === "ignore" && action.reason).toMatch(reason);
  });
});
