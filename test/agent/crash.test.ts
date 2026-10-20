import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FakeGitHubState } from "../fakes/github.ts";
import { git, REPO } from "./support.ts";

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
  it.each(["prepare", "implement", "verify", "publish", "report"])("survives a hard exit at the start of %s", async (phase) => {
    const first = await runProcess(dir, "first", phase);
    expect(first.code, first.stderr).toBe(137);

    const second = await runProcess(dir, "second");
    expect(second.code, second.stderr).toBe(0);
    expect(second.stdout).toContain('"outcome":"completed"');

    const github = JSON.parse(readFileSync(join(dir, "github.json"), "utf8")) as FakeGitHubState;
    expect(github.prs).toHaveLength(1);
    expect(github.prs[0]).toMatchObject({ head: "agent/issue-1", state: "open" });
    expect(github.prs[0]!.body).toContain("Closes #1");
    expect(github.calls.createPr).toBe(1);
    expect(github.issues[0]!.labels).toEqual(["agent:pr-open"]);
    expect(github.comments).toHaveLength(1);
    expect(github.comments[0]!.body).toContain(github.prs[0]!.url);
    expect(git(join(dir, "remote.git"), "show", "agent/issue-1:hello.txt")).toBe("hello");
    expect(existsSync(join(dir, "data", "worktrees", REPO, "issue-1"))).toBe(true);
  });
});
