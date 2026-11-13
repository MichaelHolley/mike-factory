import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { type ExecutionEnv, getOrThrow } from "@earendil-works/pi-durable/env";
import type { RepoConfig } from "../config.ts";
import { branchName, type Worktrees } from "../contracts.ts";

const execFileAsync = promisify(execFile);

/**
 * The agent's clones and worktrees live in `env` and are only touched through it. The server keeps a trusted mirror per
 * repo, the only place that talks to GitHub with the token; `env` clones from it by path and publishes through a bundle.
 */
export function createWorktrees(opts: {
  env: ExecutionEnv;
  dataDir: string;
  /** Local to the server; `env` must see it, read-only is enough, at the same path. */
  mirrorDir: string;
  owner: string;
  remoteUrl?: (repo: string) => string;
  token?: (repo: string) => Promise<string>;
}): Worktrees {
  const { env: workspace, dataDir, owner } = opts;
  const remoteUrl = opts.remoteUrl ?? ((repo) => `https://github.com/${owner}/${repo}.git`);
  const locks = new Map<string, Promise<unknown>>();

  const barePath = (repo: string) => join(dataDir, "repos", `${repo}.git`);
  const worktreePath = (repo: string, issue: number) => join(dataDir, "worktrees", repo, `issue-${issue}`);
  const mirrorPath = (repo: string) => join(opts.mirrorDir, `${repo}.git`);

  const exists = async (path: string) => getOrThrow(await workspace.exists(path, ctx));
  const createDir = async (path: string) => getOrThrow(await workspace.createDir(path, { recursive: true }, ctx));

  const git = async (cwd: string, args: string[]) => {
    let stdout = "";
    let stderr = "";
    const { exitCode } = getOrThrow(
      await workspace.exec(
        ["git", ...args],
        {
          cwd,
          onOutput: (text, _context, { stream }) => (stream === "stdout" ? (stdout += text) : (stderr += text)),
        },
        ctx,
      ),
    );
    if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed with exit code ${exitCode}: ${stderr.trim()}`);
    return stdout.trim();
  };

  const mirrorGit = async (cwd: string, args: string[], env: Record<string, string> = {}) => {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    });
    return stdout.trim();
  };

  const authEnv = async (repo: string): Promise<Record<string, string>> => {
    if (!opts.token) return {};
    const basic = Buffer.from(`x-access-token:${await opts.token(repo)}`).toString("base64");
    return {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    };
  };

  const withLock = <T>(repo: string, task: () => Promise<T>): Promise<T> => {
    const run = (locks.get(repo) ?? Promise.resolve()).then(task);
    locks.set(
      repo,
      run.catch(() => undefined),
    );
    return run;
  };

  const fetchMirror = async (repo: string) => {
    const mirror = mirrorPath(repo);
    const cloned = await access(join(mirror, "HEAD")).then(
      () => true,
      () => false,
    );
    if (!cloned) {
      await mkdir(opts.mirrorDir, { recursive: true });
      await mirrorGit(opts.mirrorDir, ["clone", "--bare", remoteUrl(repo), mirror], await authEnv(repo));
    }
    await mirrorGit(mirror, ["fetch", "--prune", "origin", "+refs/heads/*:refs/heads/*"], await authEnv(repo));
  };

  const ensureRepo = async (repo: string) => {
    const bare = barePath(repo);
    if (!(await exists(join(bare, "HEAD")))) {
      await createDir(dirname(bare));
      // `--no-local` so the clone never hardlinks the mirror's object files when both share a file system. The refspec
      // goes in with the clone, so a crash right after it cannot leave a clone that never fills `origin/*`.
      await git(dirname(bare), [
        "clone",
        "--bare",
        "--no-local",
        "--config",
        "remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*",
        mirrorPath(repo),
        bare,
      ]);
    }
    // Clones made before the mirror existed still fetch from GitHub, without credentials.
    await git(bare, ["remote", "set-url", "origin", mirrorPath(repo)]);
  };

  const refExists = (repo: string, ref: string) =>
    git(barePath(repo), ["rev-parse", "--verify", "--quiet", ref]).then(
      () => true,
      () => false,
    );

  return {
    worktreePath,

    prepare: (repo: RepoConfig, issue, { openPr }) =>
      withLock(repo.name, async () => {
        const path = worktreePath(repo.name, issue);
        const branch = branchName(issue);
        const bare = barePath(repo.name);
        await fetchMirror(repo.name);
        await ensureRepo(repo.name);
        if (await exists(path)) return { path, branch, created: false };

        await git(bare, ["fetch", "--prune", "origin"]);
        await createDir(dirname(path));
        await git(bare, ["worktree", "prune"]);
        if (await refExists(repo.name, `refs/heads/${branch}`)) {
          await git(bare, ["worktree", "add", path, branch]);
        } else {
          // A closed PR's branch may survive on the remote, already squash-merged, so only an open one is continued.
          const base =
            openPr && (await refExists(repo.name, `refs/remotes/origin/${branch}`)) ? branch : repo.defaultBranch;
          await git(bare, ["worktree", "add", "-b", branch, path, `origin/${base}`]);
        }
        return { path, branch, created: true };
      }),

    uncommitted: (repo, issue) => git(worktreePath(repo, issue), ["status", "--porcelain", "--untracked-files=all"]),

    latestCommitSubject: (repo, issue) =>
      git(worktreePath(repo, issue), ["log", "-1", "--format=%s", branchName(issue)]),

    // Under the repo lock because a mirror fetch with `--prune` would drop the branch before it is pushed.
    push: (repo, issue) =>
      withLock(repo.name, async () => {
        const branch = branchName(issue);
        const ref = `refs/heads/${branch}`;
        const bundle = getOrThrow(await workspace.createTempFile({ prefix: "publish-", suffix: ".bundle" }, ctx));
        const local = await mkdtemp(join(tmpdir(), "publish-"));
        try {
          await git(barePath(repo.name), [
            "bundle",
            "create",
            bundle,
            `refs/remotes/origin/${repo.defaultBranch}..${ref}`,
          ]);
          const localBundle = join(local, "issue.bundle");
          await writeFile(localBundle, getOrThrow(await workspace.readBinaryFile(bundle, ctx)));
          const mirror = mirrorPath(repo.name);
          await mirrorGit(mirror, [
            "-c",
            "fetch.fsckObjects=true",
            "fetch",
            "--no-tags",
            localBundle,
            `+${ref}:${ref}`,
          ]);
          await mirrorGit(mirror, ["push", "origin", `${ref}:${ref}`], await authEnv(repo.name));
        } finally {
          await workspace.remove(bundle, { force: true }, ctx);
          await rm(local, { recursive: true, force: true });
        }
      }),

    async commitsAhead(repo, issue) {
      const count = await git(worktreePath(repo.name, issue), [
        "rev-list",
        "--count",
        `origin/${repo.defaultBranch}..${branchName(issue)}`,
      ]);
      return Number(count);
    },

    remove: (repo, issue) =>
      withLock(repo, async () => {
        const bare = barePath(repo);
        if (!(await exists(join(bare, "HEAD")))) return;
        const path = worktreePath(repo, issue);
        if (await exists(path)) await git(bare, ["worktree", "remove", "--force", path]);
        await git(bare, ["worktree", "prune"]);
        if (await refExists(repo, `refs/heads/${branchName(issue)}`))
          await git(bare, ["branch", "-D", branchName(issue)]);
      }),

    async issues(repo) {
      const numbers = new Set<number>();
      const dirs = await workspace.listDir(join(dataDir, "worktrees", repo), ctx);
      for (const { name } of dirs.ok ? dirs.value : []) {
        const match = /^issue-(\d+)$/.exec(name);
        if (match) numbers.add(Number(match[1]));
      }
      if (await exists(join(barePath(repo), "HEAD"))) {
        const branches = await git(barePath(repo), ["branch", "--list", "agent/issue-*", "--format=%(refname:short)"]);
        for (const branch of branches.split("\n")) {
          const match = /^agent\/issue-(\d+)$/.exec(branch);
          if (match) numbers.add(Number(match[1]));
        }
      }
      return [...numbers].sort((a, b) => a - b);
    },

    prune: (repo) =>
      withLock(repo, async () => {
        if (await exists(join(barePath(repo), "HEAD"))) await git(barePath(repo), ["worktree", "prune"]);
      }),
  };
}
