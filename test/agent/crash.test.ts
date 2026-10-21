import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FakeGitHubState } from "../fakes/github.ts";
import { git, OTHER_REPO, REPO } from "./support.ts";

const runner = fileURLToPath(new URL("./crash-runner.ts", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function runProcess(dir: string, mode: "first" | "second", crashAt?: string) {
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
  it.each(["prepare", "implement", "verify", "publish", "report"])("survives a hard exit at the start of %s with concurrent runs in two repos", async (phase) => {
    const first = await runProcess(dir, "first", phase);
    expect(first.code, first.stderr).toBe(137);

    const second = await runProcess(dir, "second");
    expect(second.code, second.stderr).toBe(0);
    expect(second.stdout).toContain('"outcomes":["completed","completed","completed","completed"]');

    const github = JSON.parse(readFileSync(join(dir, "github.json"), "utf8")) as FakeGitHubState;
    expect(github.prs.map((pr) => `${pr.repo}:${pr.head}:${pr.state}`).sort()).toEqual([
      `${REPO}:agent/issue-1:open`,
      `${REPO}:agent/issue-2:open`,
      `${REPO}:agent/issue-3:open`,
      `${OTHER_REPO}:agent/issue-1:open`,
    ]);
    expect(github.calls.createPr).toBe(4);
    for (const pr of github.prs) {
      expect(pr.body).toContain(`Closes #${pr.head.split("-").at(-1)}`);
      const statusComments = github.comments.filter((comment) => comment.repo === pr.repo && comment.issue === Number(pr.head.split("-").at(-1)));
      expect(statusComments).toHaveLength(1);
      expect(statusComments[0]!.body).toContain(pr.url);
    }
    expect(git(join(dir, "remote.git"), "show", "agent/issue-1:hello.txt")).toBe("hello");
    expect(git(join(dir, `${OTHER_REPO}.git`), "show", "agent/issue-1:hello.txt")).toBe("hello");
    expect(existsSync(join(dir, "data", "worktrees", REPO, "issue-1"))).toBe(true);
  });
});
