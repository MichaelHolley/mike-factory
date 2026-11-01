import { execFile } from "node:child_process";
import { access, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { RepoConfig } from "../config.ts";
import { branchName, type Worktrees } from "../contracts.ts";

const execFileAsync = promisify(execFile);

const exists = (path: string) => access(path).then(() => true, () => false);

export function createWorktrees(opts: {
  dataDir: string;
  owner: string;
  remoteUrl?: (repo: string) => string;
  token?: (repo: string) => Promise<string>;
}): Worktrees {
  const { dataDir, owner } = opts;
  const remoteUrl = opts.remoteUrl ?? ((repo) => `https://github.com/${owner}/${repo}.git`);
  const locks = new Map<string, Promise<unknown>>();

  const barePath = (repo: string) => join(dataDir, "repos", `${repo}.git`);
  const worktreePath = (repo: string, issue: number) => join(dataDir, "worktrees", repo, `issue-${issue}`);

  const git = async (cwd: string, args: string[], env: Record<string, string> = {}) => {
    const { stdout } = await execFileAsync("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env } });
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
    locks.set(repo, run.catch(() => undefined));
    return run;
  };

  const fetchOrigin = async (repo: string) => git(barePath(repo), ["fetch", "--prune", "origin"], await authEnv(repo));

  const ensureRepo = async (repo: string) => {
    const bare = barePath(repo);
    if (!(await exists(join(bare, "HEAD")))) {
      await mkdir(dirname(bare), { recursive: true });
      await git(dataDir, ["clone", "--bare", remoteUrl(repo), bare], await authEnv(repo));
      await git(bare, ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"]);
    }
  };

  const branchExists = (repo: string, branch: string) =>
    git(barePath(repo), ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).then(() => true, () => false);

  return {
    worktreePath,

    prepare: (repo: RepoConfig, issue) =>
      withLock(repo.name, async () => {
        const path = worktreePath(repo.name, issue);
        const branch = branchName(issue);
        await ensureRepo(repo.name);
        if (await exists(path)) return { path, branch, created: false };

        await fetchOrigin(repo.name);
        await mkdir(dirname(path), { recursive: true });
        await git(barePath(repo.name), ["worktree", "prune"]);
        if (await branchExists(repo.name, branch)) {
          await git(barePath(repo.name), ["worktree", "add", path, branch]);
        } else {
          await git(barePath(repo.name), ["worktree", "add", "-b", branch, path, `origin/${repo.defaultBranch}`]);
        }
        return { path, branch, created: true };
      }),

    uncommitted: (repo, issue) => git(worktreePath(repo, issue), ["status", "--porcelain", "--untracked-files=all"]),

    latestCommitSubject: (repo, issue) => git(worktreePath(repo, issue), ["log", "-1", "--format=%s", branchName(issue)]),

    // Under the repo lock because a push also updates the shared remote-tracking refs.
    push: (repo, issue) =>
      withLock(repo, async () => {
        const ref = `refs/heads/${branchName(issue)}`;
        await git(worktreePath(repo, issue), ["push", "origin", `${ref}:${ref}`], await authEnv(repo));
      }),

    async commitsAhead(repo, issue) {
      const count = await git(worktreePath(repo.name, issue), ["rev-list", "--count", `origin/${repo.defaultBranch}..${branchName(issue)}`]);
      return Number(count);
    },

    remove: (repo, issue) =>
      withLock(repo, async () => {
        const bare = barePath(repo);
        if (!(await exists(join(bare, "HEAD")))) return;
        const path = worktreePath(repo, issue);
        if (await exists(path)) await git(bare, ["worktree", "remove", "--force", path]);
        await git(bare, ["worktree", "prune"]);
        if (await branchExists(repo, branchName(issue))) await git(bare, ["branch", "-D", branchName(issue)]);
      }),

    async issues(repo) {
      const numbers = new Set<number>();
      const dirs = await readdir(join(dataDir, "worktrees", repo)).catch(() => []);
      for (const dir of dirs) {
        const match = /^issue-(\d+)$/.exec(dir);
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
