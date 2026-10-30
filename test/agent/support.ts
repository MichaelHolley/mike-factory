import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider, fauxToolCall, type FauxProviderHandle } from "@earendil-works/pi-ai/providers/faux";
import type { Harness } from "@earendil-works/pi-durable";
import type { TaskId } from "@earendil-works/pi-durable";
import { asConversationId, IssueIndex, IssueState } from "../../src/agent/docs.ts";
import { type AgentDeps } from "../../src/agent/harness.ts";
import type { AppConfig, RepoConfig } from "../../src/config.ts";
import { issueKey, type GitHubClient } from "../../src/contracts.ts";
import { createWorktrees } from "../../src/git/worktrees.ts";
import { FakeGitHub, type FakeGitHubState } from "../fakes/github.ts";

export const OWNER = "michaelholley";
export const REPO = "demo";
export const OTHER_REPO = "other";
export const ctx = BACKGROUND_CONTEXT;

export const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "seed", GIT_AUTHOR_EMAIL: "s@e.x", GIT_COMMITTER_NAME: "seed", GIT_COMMITTER_EMAIL: "s@e.x" } }).trim();

function seedRemote(dir: string, repo: string) {
  const remote = join(dir, repo === REPO ? "remote.git" : `${repo}.git`);
  if (existsSync(remote)) return remote;
  const seed = join(dir, `seed-${repo}`);
  mkdirSync(seed, { recursive: true });
  git(seed, "init", "--initial-branch=main");
  writeFileSync(join(seed, "README.md"), "# demo\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-m", "seed");
  git(dir, "clone", "--bare", seed, remote);
  return remote;
}

/** Wraps a FakeGitHub so every client call is written to `file`, surviving a hard process exit. */
function persisted(github: FakeGitHub, file: string): FakeGitHub {
  return new Proxy(github, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || typeof property !== "string" || !(property in FAKE_CLIENT_METHODS)) return value;
      return async (...args: unknown[]) => {
        const result = await value.apply(target, args);
        writeFileSync(file, JSON.stringify(target.toJSON()));
        return result;
      };
    },
  });
}
const FAKE_CLIENT_METHODS: Record<keyof GitHubClient, true> = {
  getIssue: true,
  listIssueComments: true,
  upsertComment: true,
  findOpenPr: true,
  createPr: true,
  gitToken: true,
  botIdentity: true,
};

export interface World {
  dir: string;
  remote: string;
  remotes: Record<string, string>;
  github: FakeGitHub;
  config: AppConfig;
  repo: RepoConfig;
  faux: FauxProviderHandle;
  models: ReturnType<typeof createModels>;
  deps: AgentDeps;
  logs: { msg: string; data?: object }[];
}

/** `extraRepos` adds more repos with the same settings as `repo`, each with its own remote. */
export function createWorld(opts: { dir: string; repo?: Partial<RepoConfig>; extraRepos?: string[]; githubFile?: string; maxConcurrent?: number }): World {
  const names = [REPO, ...(opts.extraRepos ?? [])];
  const remotes = Object.fromEntries(names.map((name) => [name, seedRemote(opts.dir, name)]));
  const remote = remotes[REPO]!;
  const repo: RepoConfig = {
    name: REPO,
    defaultBranch: "main",
    model: { provider: "faux", modelId: "faux-1" },
    maxTurns: 60,
    maxCostUsd: 3,
    maxFixAttempts: 2,
    ...opts.repo,
  };
  const config: AppConfig = { owner: OWNER, allowedSenderId: 1, repos: names.map((name) => ({ ...repo, name })) };
  const fake =
    opts.githubFile && existsSync(opts.githubFile)
      ? FakeGitHub.fromJSON(JSON.parse(readFileSync(opts.githubFile, "utf8")) as FakeGitHubState)
      : new FakeGitHub();
  const github = opts.githubFile ? persisted(fake, opts.githubFile) : fake;
  const worktrees = createWorktrees({
    dataDir: join(opts.dir, "data"),
    owner: OWNER,
    remoteUrl: (name) => remotes[name]!,
  });
  const faux = fauxProvider({ models: [{ id: "faux-1", cost: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 } }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const logs: World["logs"] = [];
  const deps: AgentDeps = { config, github, worktrees, log: (msg, data) => logs.push({ msg, data }), maxConcurrent: opts.maxConcurrent };
  return { dir: opts.dir, remote, remotes, github: fake, config, repo, faux, models, deps, logs };
}

export const textOf = (message: Message | undefined) =>
  message?.role === "user" ? (typeof message.content === "string" ? message.content : message.content.map((part) => (part.type === "text" ? part.text : "")).join("")) : "";

/**
 * A model that never runs out of responses, so a restarted process can keep going. It commits hello.txt for a task,
 * says it tried for a failed verification, and wraps up after any tool result.
 */
export function autopilot(faux: FauxProviderHandle, decide?: (messages: Message[]) => AssistantMessage | undefined) {
  const respond = (context: { messages: Message[] }): AssistantMessage => {
    faux.appendResponses([respond]);
    const custom = decide?.(context.messages);
    if (custom) return custom;
    const last = context.messages.at(-1);
    if (last?.role === "toolResult") {
      if (last.isError && last.content.some((part) => part.type === "text" && part.text.includes("was interrupted"))) {
        return commitFile("hello.txt", "hello");
      }
      return fauxAssistantMessage("Done: wrote hello.txt.");
    }
    if (textOf(last).startsWith("Verification failed")) return fauxAssistantMessage("Tried a fix.");
    return commitFile("hello.txt", "hello");
  };
  faux.setResponses([respond]);
}

/** Writes and commits only `path`; safe to retry after a hard exit interrupted the tool result. */
export const commitFile = (path: string, content: string, subject = `feat: add ${path}`) =>
  fauxAssistantMessage(
    fauxToolCall("bash", { command: `printf %s '${content}' > ${path} && git add ${path} && (git diff --cached --quiet || git -c user.name=agent -c user.email=agent@example.com commit -qm '${subject}')` }),
    { stopReason: "toolUse" },
  );

export const startAction = (issue: number, requestId: string, instructions = "", repo = REPO) => ({ kind: "start", repo, issue, requestId, instructions }) as const;
export const stopAction = (issue: number, requestId: string) => ({ kind: "stop", repo: REPO, issue, requestId }) as const;

export async function conversationIdOf(harness: Harness, issue: number, repo = REPO) {
  const index = await harness.snapshot(IssueIndex, issueKey(OWNER, repo, issue), ctx);
  return index?.conversationId == null ? undefined : asConversationId(index.conversationId);
}

export async function issueStateOf(harness: Harness, issue: number, repo = REPO) {
  const conversationId = await conversationIdOf(harness, issue, repo);
  return conversationId && harness.snapshot(IssueState, conversationId, ctx);
}

export async function pipelineResult(harness: Harness, issue: number, repo = REPO) {
  const state = await issueStateOf(harness, issue, repo);
  if (state?.pipelineTaskId == null) throw new Error("no pipeline task");
  return (await harness.waitForTask(state.pipelineTaskId as TaskId, ctx)).state.outcome;
}
