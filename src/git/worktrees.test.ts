import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RepoConfig } from "../config.ts";
import { createWorktrees } from "./worktrees.ts";

const run = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await run("git", args, { cwd })).stdout.trim();
const exists = (path: string) => access(path).then(() => true, () => false);
const commit = async (cwd: string, message: string) => {
  await git(cwd, "add", "-A");
  await git(cwd, "-c", "user.name=bot", "-c", "user.email=bot@example.com", "commit", "-m", message);
};

const repo: RepoConfig = {
  name: "demo",
  defaultBranch: "main",
  model: { provider: "p", modelId: "m" },
  maxTurns: 1,
  maxCostUsd: 1,
  maxFixAttempts: 1,
};

let root: string;
let remote: string;
let dataDir: string;
let worktrees: ReturnType<typeof createWorktrees>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "worktrees-test-"));
  remote = join(root, "remote.git");
  dataDir = join(root, "data");
  const seed = join(root, "seed");
  await run("git", ["init", "--bare", "--initial-branch=main", remote]);
  await run("git", ["init", "--initial-branch=main", seed]);
  await writeFile(join(seed, "README.md"), "hello\n");
  await git(seed, "add", "-A");
  await git(seed, "-c", "user.name=seed", "-c", "user.email=seed@example.com", "commit", "-m", "seed");
  await git(seed, "push", remote, "main");
  worktrees = createWorktrees({ dataDir, owner: "o", remoteUrl: () => remote });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createWorktrees", () => {
  it("creates a bare clone and a worktree on agent/issue-<n>", async () => {
    const info = await worktrees.prepare(repo, 1);
    expect(info).toEqual({ path: join(dataDir, "worktrees", "demo", "issue-1"), branch: "agent/issue-1", created: true });
    expect(info.path).toBe(worktrees.worktreePath("demo", 1));
    expect(await git(info.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe("agent/issue-1");
    expect(await readFile(join(info.path, "README.md"), "utf8")).toBe("hello\n");
    const bare = join(dataDir, "repos", "demo.git");
    expect(await git(bare, "config", "remote.origin.fetch")).toBe("+refs/heads/*:refs/remotes/origin/*");
  });

  it("reuses an existing worktree", async () => {
    await worktrees.prepare(repo, 1);
    await writeFile(join(worktrees.worktreePath("demo", 1), "wip.txt"), "wip");
    const again = await worktrees.prepare(repo, 1);
    expect(again.created).toBe(false);
    expect(await exists(join(again.path, "wip.txt"))).toBe(true);
  });

  it("re-adds the worktree from the existing branch when the path is gone", async () => {
    const { path } = await worktrees.prepare(repo, 1);
    await writeFile(join(path, "a.txt"), "a");
    await commit(path, "add a");
    await rm(path, { recursive: true, force: true });

    const again = await worktrees.prepare(repo, 1);
    expect(again.created).toBe(true);
    expect(await exists(join(path, "a.txt"))).toBe(true);
    expect(await worktrees.commitsAhead(repo, 1)).toBe(1);
  });

  it("keeps parallel issues in separate trees", async () => {
    const [a, b] = await Promise.all([worktrees.prepare(repo, 1), worktrees.prepare(repo, 2)]);
    await writeFile(join(a.path, "only-a.txt"), "a");
    expect(await exists(join(b.path, "only-a.txt"))).toBe(false);
    expect(await git(b.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe("agent/issue-2");
  });

  it("lists uncommitted changes, empty once committed", async () => {
    const { path } = await worktrees.prepare(repo, 1);
    expect(await worktrees.uncommittedChanges("demo", 1)).toBe("");
    await writeFile(join(path, "new.txt"), "x");
    expect(await worktrees.uncommittedChanges("demo", 1)).toBe("?? new.txt");
    await commit(path, "feat: new");
    expect(await worktrees.uncommittedChanges("demo", 1)).toBe("");
    expect(await worktrees.commitsAhead(repo, 1)).toBe(1);
  });

  it("pushes the issue branch to the remote, twice without error", async () => {
    const { path } = await worktrees.prepare(repo, 1);
    await writeFile(join(path, "new.txt"), "x");
    await commit(path, "feat: new");
    await worktrees.push("demo", 1);
    await worktrees.push("demo", 1);
    expect(await git(remote, "rev-parse", "refs/heads/agent/issue-1")).toBe(await git(path, "rev-parse", "HEAD"));
    expect(await git(remote, "rev-parse", "refs/heads/main")).not.toBe(await git(path, "rev-parse", "HEAD"));
  });

  it("removes worktree and branch, and is idempotent", async () => {
    const { path } = await worktrees.prepare(repo, 1);
    await worktrees.remove("demo", 1);
    await worktrees.remove("demo", 1);
    await worktrees.remove("never-cloned", 9);
    expect(await exists(path)).toBe(false);
    expect(await git(join(dataDir, "repos", "demo.git"), "branch", "--list", "agent/issue-1")).toBe("");
    expect((await worktrees.prepare(repo, 1)).created).toBe(true);
  });

  it("lists issues that have a worktree or only a branch left", async () => {
    expect(await worktrees.issues("demo")).toEqual([]);
    await worktrees.prepare(repo, 2);
    const { path } = await worktrees.prepare(repo, 10);
    await rm(path, { recursive: true });
    await worktrees.prune("demo");
    expect(await worktrees.issues("demo")).toEqual([2, 10]);
    await worktrees.remove("demo", 10);
    expect(await worktrees.issues("demo")).toEqual([2]);
  });
});
