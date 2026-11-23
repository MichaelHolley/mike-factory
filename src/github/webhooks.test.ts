import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidSignatureError, parseCommand, verifyWebhook, type WebhookConfig } from "./webhooks.ts";

const secret = "s3cret";
const config: WebhookConfig = { owner: "acme", allowedSenderIds: [42] };

const payload = (overrides: Record<string, unknown> = {}) => ({
  action: "created",
  comment: { id: 99, body: "/mike" },
  issue: { number: 12 },
  sender: { id: 42, login: "octocat" },
  repository: { name: "widgets", owner: { login: "Acme" } },
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
    expect(await run(payload())).toEqual({
      kind: "start",
      repo: "widgets",
      issue: 12,
      requestId: "comment-99",
      instructions: "",
      reviewer: "octocat",
    });
    expect(await run(payload({ comment: { id: 99, body: "/mike stop" } }))).toEqual({
      kind: "stop",
      repo: "widgets",
      issue: 12,
      requestId: "comment-99",
    });
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

  const closedPr = (
    overrides: { action?: string; ref?: string; headRepo?: string; repo?: string; merged?: boolean } = {},
  ) => {
    const repo = overrides.repo ?? "widgets";
    return {
      action: overrides.action ?? "closed",
      pull_request: {
        merged: overrides.merged ?? false,
        head: {
          ref: overrides.ref ?? "agent/issue-12",
          repo: { full_name: overrides.headRepo ?? `Acme/${repo}` },
        },
      },
      repository: { name: repo, full_name: `Acme/${repo}`, owner: { login: "Acme" } },
    };
  };

  it.each(["mike/12-add-dark-mode", "agent/issue-12"])("records a closed agent PR on %s", async (ref) => {
    expect(await run(closedPr({ ref }), { event: "pull_request" })).toEqual({
      kind: "pr-state",
      repo: "widgets",
      issue: 12,
      branch: ref,
      state: "closed",
    });
  });

  it.each([
    ["merged", closedPr({ merged: true }), "merged"],
    ["reopened", closedPr({ action: "reopened" }), "open"],
  ])("records a %s agent PR", async (_name, body, state) => {
    expect(await run(body, { event: "pull_request" })).toMatchObject({ kind: "pr-state", state });
  });

  it.each([
    ["opened PR", closedPr({ action: "opened" }), /action/],
    ["non-agent branch", closedPr({ ref: "feature/x" }), /agent branch/],
    ["fork PR", closedPr({ headRepo: "someone/widgets" }), /fork/],
  ])("ignores a pull_request event for a %s", async (_name, body, reason) => {
    const action = await run(body, { event: "pull_request" });
    expect(action.kind === "ignore" && action.reason).toMatch(reason);
  });

  it.each([
    ["other event", payload(), { event: "issues" }, /event/],
    ["edited comment", payload({ action: "edited" }), {}, /action/],
    ["non-command comment", payload({ comment: { id: 99, body: "looks good" } }), {}, /command/],
    ["comment from another sender or the bot", payload({ sender: { id: 7 } }), {}, /sender/],
    ["wrong owner", payload({ repository: { name: "widgets", owner: { login: "someone" } } }), {}, /owner/],
  ])("ignores %s", async (_name, body, opts, reason) => {
    const action = await run(body, opts);
    expect(action.kind).toBe("ignore");
    expect(action.kind === "ignore" && action.reason).toMatch(reason);
  });

  describe("pull request feedback", () => {
    const pr = (headRef = "agent/issue-12", headRepo = "Acme/widgets") => ({
      number: 30,
      state: "open",
      head: { ref: headRef, repo: { full_name: headRepo } },
    });
    const repository = {
      name: "widgets",
      full_name: "Acme/widgets",
      owner: { login: "Acme" },
    };
    const sender = { id: 42, login: "octocat" };
    const review = (overrides: { state?: string; body?: string; headRepo?: string; senderId?: number } = {}) => ({
      action: "submitted",
      review: {
        id: 7,
        node_id: "PRR_7",
        body: overrides.body ?? "Rename it",
        state: overrides.state ?? "changes_requested",
      },
      pull_request: pr(undefined, overrides.headRepo),
      sender: { ...sender, id: overrides.senderId ?? 42 },
      repository,
    });
    const feedback = (overrides: object) => ({
      kind: "feedback",
      repo: "widgets",
      pr: 30,
      reviewer: "octocat",
      ...overrides,
    });

    it("turns a Request changes review into feedback", async () => {
      expect(await run(review(), { event: "pull_request_review" })).toEqual(
        feedback({
          id: "review-7",
          nodeId: "PRR_7",
          source: { type: "review", reviewId: 7 },
          instructions: "Rename it",
        }),
      );
    });

    it("keys an inline /mike comment by its review", async () => {
      const body = {
        action: "created",
        comment: { id: 81, node_id: "PRRC_81", body: "/mike use a map", pull_request_review_id: 7 },
        pull_request: pr(),
        sender,
        repository,
      };
      expect(await run(body, { event: "pull_request_review_comment" })).toEqual(
        feedback({
          id: "review-7",
          nodeId: "PRRC_81",
          source: { type: "review", reviewId: 7 },
          instructions: "use a map",
        }),
      );
    });

    it("turns a /mike conversation comment on a PR into feedback, and /mike stop into a stop", async () => {
      const comment = (body: string) =>
        payload({ comment: { id: 99, node_id: "IC_99", body }, issue: { number: 30, pull_request: {} }, sender });
      expect(await run(comment("/mike add docs"))).toEqual(
        feedback({ id: "pr-comment-99", nodeId: "IC_99", source: { type: "comment" }, instructions: "add docs" }),
      );
      expect(await run(comment("/mike stop"))).toEqual({ kind: "pr-stop", repo: "widgets", pr: 30 });
      expect(await run(review({ state: "commented", body: "/mike stop" }), { event: "pull_request_review" })).toEqual({
        kind: "pr-stop",
        repo: "widgets",
        pr: 30,
      });
    });

    it.each([
      ["Comment review without /mike", review({ state: "commented" }), /no \/mike/],
      ["Approve review without /mike", review({ state: "approved", body: "" }), /no \/mike/],
      ["review from another sender", review({ senderId: 7 }), /sender/],
      ["review on a fork's agent branch", review({ headRepo: "someone/widgets" }), /fork/],
    ])("ignores a %s", async (_name, body, reason) => {
      const action = await run(body, { event: "pull_request_review" });
      expect(action.kind === "ignore" && action.reason).toMatch(reason);
    });
  });
});
