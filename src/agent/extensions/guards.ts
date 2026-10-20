import type { Context } from "@earendil-works/chord";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import {
  defineExtension,
  GenerationTask,
  hook,
  ToolTask,
  UsageDoc,
  type DocumentReader,
  type ConversationId,
  type TaskId,
  type UsageState,
} from "@earendil-works/pi-durable";
import { posix } from "node:path";
import { findRepo, type AppConfig, type RepoConfig } from "../../config.ts";
import { IssueState } from "../docs.ts";

const GIT_OPTIONS = String.raw`(?:\s+(?:-C|-c|--git-dir|--work-tree)\s+\S+|\s+-\S+)*`;
const COMMAND_START = String.raw`(?:^|[\s;&|(\`])`;
const BLOCKED_COMMANDS: { pattern: RegExp; reason: string }[] = [
  { pattern: new RegExp(String.raw`${COMMAND_START}git${GIT_OPTIONS}\s+push\b`), reason: "git push is done by the pipeline, not by the agent" },
  { pattern: new RegExp(String.raw`${COMMAND_START}git${GIT_OPTIONS}\s+remote\b`), reason: "git remote is not allowed" },
  { pattern: new RegExp(String.raw`${COMMAND_START}gh(?:\s|$)`), reason: "the GitHub CLI is not allowed" },
  { pattern: /\b(?:curl|wget)\b[^\n]*api\.github\.com/, reason: "calling the GitHub API is not allowed" },
  { pattern: /\brm\s+(?:-\S+\s+)*-\S*[rR]\S*\s+(?:-\S+\s+)*(?:\/|\/\*|~|~\/|\$HOME|\$\{HOME\})(?:\s|$)/, reason: "destructive rm is not allowed" },
];

const ALLOWED_ABSOLUTE_ROOTS = ["/usr/", "/bin/", "/sbin/", "/lib/", "/lib64/", "/tmp/", "/dev/null", "/dev/stdin", "/dev/stdout", "/dev/stderr"];
const ABSOLUTE_PATH = /(?:^|[\s"'=(])(\/[^\s"'`;|&<>)]*)/g;

const insideWorktree = (path: string, worktreePath: string) => {
  const normalized = posix.normalize(path);
  const root = posix.normalize(worktreePath);
  return normalized === root || normalized.startsWith(`${root}/`);
};

/** Best-effort: returns the first absolute path that is neither inside the worktree nor a harmless system location. */
export function pathOutsideWorktree(text: string, worktreePath: string): string | undefined {
  for (const match of text.matchAll(ABSOLUTE_PATH)) {
    const path = match[1]!;
    if (insideWorktree(path, worktreePath)) continue;
    const normalized = posix.normalize(path);
    if (ALLOWED_ABSOLUTE_ROOTS.some((root) => normalized === root || normalized.startsWith(root))) continue;
    return path;
  }
  return undefined;
}

/** Returns why a bash command must not run, or undefined when it may. */
export function bashViolation(command: string, worktreePath: string): string | undefined {
  const blocked = BLOCKED_COMMANDS.find(({ pattern }) => pattern.test(command));
  if (blocked) return blocked.reason;
  const outside = pathOutsideWorktree(command, worktreePath);
  return outside && `path outside the issue worktree: ${outside}`;
}

export const assistantTurns = (messages: readonly Message[]) => messages.filter((message) => message.role === "assistant").length;

export const totalCostUsd = (usage: Readonly<UsageState> | undefined) =>
  usage ? [...Object.values(usage.models), ...Object.values(usage.tools)].reduce((sum, entry) => sum + entry.cost.total, 0) : 0;

export function budgetBreach(repo: Pick<RepoConfig, "maxTurns" | "maxCostUsd">, spent: { turns: number; costUsd: number }): string | undefined {
  if (spent.turns >= repo.maxTurns) return `turn budget exhausted (${spent.turns} of ${repo.maxTurns} turns used)`;
  if (spent.costUsd >= repo.maxCostUsd) return `cost budget exhausted ($${spent.costUsd.toFixed(4)} of $${repo.maxCostUsd})`;
  return undefined;
}

/** Reads a conversation's spend as the budget sees it. `messages` are the model context. */
export async function spentOf(read: DocumentReader, conversationId: ConversationId, messages: readonly Message[], context: Context) {
  return { turns: assistantTurns(messages), costUsd: totalCostUsd(await read.snapshot(UsageDoc, conversationId, context)) };
}

export const lastAssistantText = (messages: readonly Message[]): string => {
  const last = messages.findLast((message): message is AssistantMessage => message.role === "assistant");
  return last?.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("").trim() ?? "";
};

const PATH_TOOLS = new Set(["read", "write", "edit"]);

/**
 * Bash and file-path guards plus turn and cost budgets. A budget breach aborts the generation, so the run's submission
 * settles unanswered and the pipeline reports the breach.
 */
export function createGuards(opts: { config: AppConfig; abortTask: (id: TaskId) => void }) {
  return defineExtension({
    name: "guards",
    hooks: [
      hook(ToolTask, {
        beforeTool: async (call, api, context) => {
          const state = await api.snapshot(IssueState, api.conversationId, context);
          if (!state || state.worktreePath === "") return undefined;
          const args = call.arguments as { command?: unknown; path?: unknown };
          if (call.name === "bash" && typeof args.command === "string") {
            const reason = bashViolation(args.command, state.worktreePath);
            if (reason) return { block: `Blocked: ${reason}.` };
          }
          if (PATH_TOOLS.has(call.name) && typeof args.path === "string") {
            const outside = pathOutsideWorktree(args.path, state.worktreePath);
            if (outside) return { block: `Blocked: path outside the issue worktree: ${outside}.` };
          }
          return undefined;
        },
      }),
      hook(GenerationTask, {
        beforeRequest: async (request, api, context) => {
          const state = await api.snapshot(IssueState, api.conversationId, context);
          const repo = state && findRepo(opts.config, state.repo);
          if (!repo) return undefined;
          const spent = await spentOf(api, api.conversationId, request.messages, context);
          if (budgetBreach(repo, spent)) opts.abortTask(api.taskId);
          return undefined;
        },
      }),
    ],
  });
}
