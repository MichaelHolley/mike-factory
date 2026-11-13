import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { Connection, localDaemon, RemoteExecutionEnv } from "@earendil-works/pi-env";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RepoConfig } from "../config.ts";
import { createWorktrees } from "./worktrees.ts";

const run = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await run("git", args, { cwd })).stdout.trim();
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
const commit = (cwd: string, message: string) =>
  git(cwd, "-c", "user.name=agent", "-c", "user.email=agent@example.com", "commit", "-qam", message);

const repo: RepoConfig = {
  name: "demo",
  defaultBranch: "main",
  model: { provider: "p", modelId: "m" },
  maxTurns: 1,
  maxCostUsd: 1,
  thinkingLevel: "high",
  maxFixAttempts: 1,
};

let root: string;
let remote: string;
let seed: string;
let dataDir: string;
let worktrees: ReturnType<typeof createWorktrees>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "worktrees-test-"));
  remote = join(root, "remote.git");
  dataDir = join(root, "data");
  seed = join(root, "seed");
  await run("git", ["init", "--bare", "--initial-branch=main", remote]);
  await run("git", ["init", "--initial-branch=main", seed]);
  await writeFile(join(seed, "README.md"), "hello\n");
  await git(seed, "add", "-A");
  await git(seed, "-c", "user.name=seed", "-c", "user.email=seed@example.com", "commit", "-m", "seed");
  await git(seed, "push", remote, "main");
  worktrees = createWorktrees({
    env: new NodeExecutionEnv({ cwd: root }),
    dataDir,
    mirrorDir: join(root, "mirrors"),
    owner: "o",
    remoteUrl: () => remote,
    token: async () => "test-token",
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createWorktrees", () => {
  it("creates a bare clone and a worktree on agent/issue-<n>", async () => {
    const info = await worktrees.prepare(repo, 1, { openPr: false });
    expect(info).toEqual({
      path: join(dataDir, "worktrees", "demo", "issue-1"),
      branch: "agent/issue-1",
      created: true,
    });
    expect(info.path).toBe(worktrees.worktreePath("demo", 1));
    expect(await git(info.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe("agent/issue-1");
    expect(await readFile(join(info.path, "README.md"), "utf8")).toBe("hello\n");
    const bare = join(dataDir, "repos", "demo.git");
    expect(await git(bare, "config", "remote.origin.fetch")).toBe("+refs/heads/*:refs/remotes/origin/*");
  });

  it("reuses an existing worktree", async () => {
    await worktrees.prepare(repo, 1, { openPr: false });
    await writeFile(join(worktrees.worktreePath("demo", 1), "wip.txt"), "wip");
    const again = await worktrees.prepare(repo, 1, { openPr: false });
    expect(again.created).toBe(false);
    expect(await exists(join(again.path, "wip.txt"))).toBe(true);
  });

  it("re-adds the worktree from the existing branch when the path is gone", async () => {
    const { path } = await worktrees.prepare(repo, 1, { openPr: false });
    await writeFile(join(path, "a.txt"), "a");
    await git(path, "add", "a.txt");
    await commit(path, "add a");
    await rm(path, { recursive: true, force: true });

    const again = await worktrees.prepare(repo, 1, { openPr: false });
    expect(again.created).toBe(true);
    expect(await exists(join(path, "a.txt"))).toBe(true);
    expect(await worktrees.commitsAhead(repo, 1)).toBe(1);
  });

  it("starts a new worktree from the remote issue branch only while its PR is open", async () => {
    await worktrees.prepare(repo, 3, { openPr: false });
    const main = await git(seed, "rev-parse", "HEAD");
    await git(seed, "checkout", "-qb", "agent/issue-1");
    await writeFile(join(seed, "README.md"), "resumed\n");
    await commit(seed, "resume");
    await git(seed, "push", remote, "agent/issue-1", "agent/issue-1:agent/issue-2");

    const open = await worktrees.prepare(repo, 1, { openPr: true });
    const closed = await worktrees.prepare(repo, 2, { openPr: false });
    expect(await git(open.path, "rev-parse", "HEAD")).toBe(await git(seed, "rev-parse", "HEAD"));
    expect(await git(closed.path, "rev-parse", "HEAD")).toBe(main);
  });

  it("fetches through the mirror from a clone whose origin points elsewhere", async () => {
    const bare = join(dataDir, "repos", "demo.git");
    await run("git", ["clone", "--bare", remote, bare]);
    await git(bare, "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
    await git(bare, "remote", "set-url", "origin", join(root, "gone.git"));

    const { path } = await worktrees.prepare(repo, 1, { openPr: false });
    expect(await git(path, "rev-parse", "HEAD")).toBe(await git(remote, "rev-parse", "main"));
  });

  it("keeps parallel issues in separate trees", async () => {
    const [a, b] = await Promise.all([
      worktrees.prepare(repo, 1, { openPr: false }),
      worktrees.prepare(repo, 2, { openPr: false }),
    ]);
    await writeFile(join(a.path, "only-a.txt"), "a");
    expect(await exists(join(b.path, "only-a.txt"))).toBe(false);
    expect(await git(b.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe("agent/issue-2");
  });

  it("lists uncommitted changes but not ignored files", async () => {
    const { path } = await worktrees.prepare(repo, 1, { openPr: false });
    expect(await worktrees.uncommitted("demo", 1)).toBe("");
    await writeFile(join(path, ".gitignore"), "build/\n");
    await git(path, "add", ".gitignore");
    await commit(path, "ignore build");
    await mkdir(join(path, "build"));
    await writeFile(join(path, "build", "out.js"), "x");
    expect(await worktrees.uncommitted("demo", 1)).toBe("");
    await writeFile(join(path, "README.md"), "changed\n");
    await mkdir(join(path, "scripts"));
    await writeFile(join(path, "scripts", "check.sh"), "x");
    expect((await worktrees.uncommitted("demo", 1)).split("\n")).toEqual(["M README.md", "?? scripts/check.sh"]);
  });

  it("reads only the latest commit subject on the requested issue branch", async () => {
    const { path } = await worktrees.prepare(repo, 1, { openPr: false });
    await worktrees.prepare(repo, 2, { openPr: false });
    expect(await worktrees.latestCommitSubject("demo", 1)).toBe("seed");
    await writeFile(join(path, "README.md"), "changed\n");
    await commit(path, "feat(demo)!: change greeting\n\nCommit body, not part of the subject.");
    expect(await worktrees.latestCommitSubject("demo", 1)).toBe("feat(demo)!: change greeting");
    expect(await worktrees.latestCommitSubject("demo", 2)).toBe("seed");
    await writeFile(join(path, "README.md"), "changed again\n");
    await commit(path, "fix: adjust greeting");
    expect(await worktrees.latestCommitSubject("demo", 1)).toBe("fix: adjust greeting");
  });

  it("pushes the issue branch to the remote, twice without error", async () => {
    const { path } = await worktrees.prepare(repo, 1, { openPr: false });
    await writeFile(join(path, "new.txt"), "x");
    await git(path, "add", "new.txt");
    await commit(path, "feat: new");
    await worktrees.push(repo, 1);
    await worktrees.push(repo, 1);
    expect(await git(remote, "rev-parse", "refs/heads/agent/issue-1")).toBe(await git(path, "rev-parse", "HEAD"));
    expect(await git(remote, "rev-parse", "refs/heads/main")).not.toBe(await git(path, "rev-parse", "HEAD"));
  });

  it("prepares and publishes through a remote execution environment", async () => {
    const connection = new Connection({ command: [localDaemon()] });
    try {
      const remoteWorktrees = createWorktrees({
        env: new RemoteExecutionEnv({ connection, id: "pi-env:test", cwd: root }),
        dataDir,
        mirrorDir: join(root, "mirrors"),
        owner: "o",
        remoteUrl: () => remote,
      });
      const { path } = await remoteWorktrees.prepare(repo, 1, { openPr: false });
      await writeFile(join(path, "new.txt"), "x");
      await git(path, "add", "new.txt");
      await commit(path, "feat: new");
      await remoteWorktrees.push(repo, 1);
      expect(await git(remote, "rev-parse", "refs/heads/agent/issue-1")).toBe(await git(path, "rev-parse", "HEAD"));
    } finally {
      connection.close();
    }
  });

  it("publishes without running the agent clone's hooks or fsmonitor with credentials", async () => {
    const { path } = await worktrees.prepare(repo, 1, { openPr: false });
    const marker = join(root, "planted.log");
    const planted = `#!/bin/sh\nenv >> "${marker}"\n`;
    const bare = join(dataDir, "repos", "demo.git");
    await writeFile(join(root, "fsmonitor.sh"), planted, { mode: 0o755 });
    await writeFile(join(bare, "hooks", "pre-push"), planted, { mode: 0o755 });
    await git(bare, "config", "core.fsmonitor", join(root, "fsmonitor.sh"));
    await writeFile(join(path, "README.md"), "changed\n");
    await commit(path, "feat: change");

    await worktrees.push(repo, 1);
    expect(await git(remote, "rev-parse", "refs/heads/agent/issue-1")).toBe(await git(path, "rev-parse", "HEAD"));
    expect(await readFile(marker, "utf8").catch(() => "")).not.toContain("AUTHORIZATION");
  });

  it("refuses to publish malformed objects", async () => {
    const { path } = await worktrees.prepare(repo, 1, { openPr: false });
    const tree = await git(path, "rev-parse", "HEAD^{tree}");
    const parent = await git(path, "rev-parse", "HEAD");
    const object = join(root, "bad-commit");
    const who = "agent <agent@example.com>1700000000 +0000";
    await writeFile(object, `tree ${tree}\nparent ${parent}\nauthor ${who}\ncommitter ${who}\n\nbad\n`);
    const bad = await git(path, "hash-object", "-t", "commit", "--literally", "-w", object);
    await git(path, "update-ref", "refs/heads/agent/issue-1", bad);

    await expect(worktrees.push(repo, 1)).rejects.toThrow();
    await expect(git(remote, "rev-parse", "--verify", "refs/heads/agent/issue-1")).rejects.toThrow();
  });

  it("publishes only the issue branch from a bundle the runner stuffed with tags", async () => {
    class StuffingEnv extends NodeExecutionEnv {
      override exec(...[command, ...rest]: Parameters<NodeExecutionEnv["exec"]>) {
        const stuffed =
          Array.isArray(command) && command[1] === "bundle" ? [...command, "refs/tags/origin/main"] : command;
        return super.exec(stuffed, ...rest);
      }
    }
    const stuffing = createWorktrees({
      env: new StuffingEnv({ cwd: root }),
      dataDir,
      mirrorDir: join(root, "mirrors"),
      owner: "o",
      remoteUrl: () => remote,
    });
    const { path } = await stuffing.prepare(repo, 1, { openPr: false });
    await writeFile(join(path, "README.md"), "changed\n");
    await commit(path, "feat: change");
    await git(path, "tag", "origin/main");

    await stuffing.push(repo, 1);
    expect(await git(join(root, "mirrors", "demo.git"), "tag", "--list")).toBe("");
  });

  it("removes worktree and branch, and is idempotent", async () => {
    const { path } = await worktrees.prepare(repo, 1, { openPr: false });
    await worktrees.remove("demo", 1);
    await worktrees.remove("demo", 1);
    await worktrees.remove("never-cloned", 9);
    expect(await exists(path)).toBe(false);
    expect(await git(join(dataDir, "repos", "demo.git"), "branch", "--list", "agent/issue-1")).toBe("");
    expect((await worktrees.prepare(repo, 1, { openPr: false })).created).toBe(true);
  });

  it("lists issues that have a worktree or only a branch left", async () => {
    expect(await worktrees.issues("demo")).toEqual([]);
    await worktrees.prepare(repo, 2, { openPr: false });
    const { path } = await worktrees.prepare(repo, 10, { openPr: false });
    await rm(path, { recursive: true });
    await worktrees.prune("demo");
    expect(await worktrees.issues("demo")).toEqual([2, 10]);
    await worktrees.remove("demo", 10);
    expect(await worktrees.issues("demo")).toEqual([2]);
  });
});
