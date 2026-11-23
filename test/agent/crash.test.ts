import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueOfBranch } from "../../src/contracts.ts";
import type { FakeGitHubState } from "../fakes/github.ts";
import { git, OTHER_REPO, REPO } from "./support.ts";

const runner = fileURLToPath(new URL("./crash-runner.ts", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function runProcess(dir: string, mode: string, crashAt?: string) {
  const { CRASH_AT: _inherited, ...env } = process.env;
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", runner], {
      cwd: repoRoot,
      env: { ...env, STATE_DIR: dir, MODE: mode, ...(crashAt ? { CRASH_AT: crashAt } : {}) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-crash-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("restart safety", () => {
  it.each(["prepare", "implement", "verify", "revise", "publish", "report"])(
    "survives a hard exit at the start of %s with concurrent runs in two repos",
    async (phase) => {
      const first = await runProcess(dir, "first", phase);
      expect(first.code, first.stderr).toBe(137);

      const second = await runProcess(dir, "second");
      expect(second.code, second.stderr).toBe(0);
      expect(second.stdout).toContain('"outcomes":["completed","completed","completed","completed"]');
      expect(second.stdout).toContain('"attachmentMessages":[1,1,1,1]');

      const github = JSON.parse(readFileSync(join(dir, "github.json"), "utf8")) as FakeGitHubState;
      expect(github.prs.map((pr) => `${pr.repo}:${pr.head}:${pr.state}`).sort()).toEqual([
        `${REPO}:mike/1-add-hello:open`,
        `${REPO}:mike/2-add-hello:open`,
        `${REPO}:mike/3-add-hello:open`,
        `${OTHER_REPO}:mike/1-add-hello:open`,
      ]);
      expect(github.calls.createPr).toBe(4);
      for (const pr of github.prs) {
        expect(pr.body).toContain(`Closes #${issueOfBranch(pr.head)}`);
        const statusComments = github.comments.filter(
          (comment) => comment.repo === pr.repo && comment.issue === Number(issueOfBranch(pr.head)),
        );
        expect(statusComments).toHaveLength(1);
        expect(statusComments[0]!.body).toContain(pr.url);
      }
      expect(git(join(dir, "remote.git"), "show", "mike/1-add-hello:hello.txt")).toBe("hello");
      expect(git(join(dir, `${OTHER_REPO}.git`), "show", "mike/1-add-hello:hello.txt")).toBe("hello");
      expect(existsSync(join(dir, "data", "worktrees", REPO, "issue-1"))).toBe(true);
    },
  );

  it("reposts no replies and re-requests no review after a hard exit in report", async () => {
    const first = await runProcess(dir, "review-first", "report:replied");
    expect(first.code, first.stderr).toBe(137);

    const second = await runProcess(dir, "review-second");
    expect(second.code, second.stderr).toBe(0);
    expect(second.stdout).toContain('"outcomes":["completed"]');
    expect(second.stdout).toContain('"attachmentMessages":[1]');

    const github = JSON.parse(readFileSync(join(dir, "github.json"), "utf8")) as FakeGitHubState;
    // The exit came between posting and recording the reply, so the rerun posts again and its marker finds the first.
    expect(github.calls.replyToReviewComment).toBe(2);
    expect(github.reviewComments.filter((comment) => comment.inReplyTo !== null)).toHaveLength(1);
    expect(github.reviewRequests).toHaveLength(1);
  });
});
