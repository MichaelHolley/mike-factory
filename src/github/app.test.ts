import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "./app.ts";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@octokit/app", () => ({
  App: class {
    octokit = { request };
    async getInstallationOctokit() {
      return this.octokit;
    }
  },
}));

const botLogin = "test-mike[bot]";
const tag = "<!-- agent-status -->";
const createRoute = "POST /repos/{owner}/{repo}/issues/{issue_number}/comments";
const updateRoute = "PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}";

type Comment = { id: number; user: { login: string } | null; body: string | null };

function clientWithComments(comments: Comment[]) {
  request.mockImplementation(async (route: string) => {
    switch (route) {
      case "GET /app":
        return { data: { slug: "test-mike" } };
      case "GET /repos/{owner}/{repo}/installation":
        return { data: { id: 1 } };
      case "GET /repos/{owner}/{repo}/issues/{issue_number}/comments":
        return { data: comments };
      case createRoute:
      case updateRoute:
        return { data: {} };
      default:
        throw new Error(`Unexpected GitHub request: ${route}`);
    }
  });
  return createGitHubClient({ appId: "1", privateKey: "unused", owner: "owner" });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 42 }))));
});

afterEach(() => vi.unstubAllGlobals());

describe("upsertComment", () => {
  it.each([
    ["a human", { login: "contributor" }],
    ["another bot", { login: "other-app[bot]" }],
    ["a deleted author", null],
  ])("creates a bot comment when only %s carries the marker", async (_name, user) => {
    const client = clientWithComments([
      { id: 10, user, body: `${tag}\nPlanted marker` },
      { id: 11, user: { login: botLogin }, body: "An unrelated bot comment" },
    ]);

    await client.upsertComment("repo", 51, "agent-status", "Working on this.");

    expect(request).toHaveBeenCalledWith(createRoute, {
      owner: "owner",
      repo: "repo",
      issue_number: 51,
      body: `${tag}\nWorking on this.`,
    });
    expect(request.mock.calls.some(([route]) => route === updateRoute)).toBe(false);
  });

  it("updates the bot's marked comment even when other authors planted the marker first", async () => {
    const client = clientWithComments([
      { id: 10, user: { login: "contributor" }, body: tag },
      { id: 11, user: { login: "other-app[bot]" }, body: tag },
      { id: 12, user: { login: botLogin }, body: null },
      { id: 13, user: { login: botLogin }, body: `${tag}\nWorking on this.` },
    ]);

    await client.upsertComment("repo", 51, "agent-status", "Done.");

    expect(request).toHaveBeenCalledWith(updateRoute, {
      owner: "owner",
      repo: "repo",
      comment_id: 13,
      body: `${tag}\nDone.`,
    });
    expect(request.mock.calls.some(([route]) => route === createRoute)).toBe(false);
  });
});
