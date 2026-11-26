import type { Context } from "@earendil-works/chord/context";
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
import type { FactoryConfig } from "../../config.ts";
import { IssueState } from "../docs.ts";

const GIT_OPTIONS = String.raw`(?:\s+(?:-C|-c|--git-dir|--work-tree)\s+\S+|\s+-\S+)*`;
const COMMAND_START = String.raw`(?:^|[\s;&|(\`])`;
const BLOCKED_COMMANDS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: new RegExp(String.raw`${COMMAND_START}git${GIT_OPTIONS}\s+push\b`),
    reason: "git push is done by the pipeline, not by the agent",
  },
  {
    pattern: new RegExp(String.raw`${COMMAND_START}git${GIT_OPTIONS}\s+remote\b`),
    reason: "git remote is not allowed",
  },
  { pattern: new RegExp(String.raw`${COMMAND_START}gh(?:\s|$)`), reason: "the GitHub CLI is not allowed" },
  { pattern: /\b(?:curl|wget)\b[^\n]*api\.github\.com/, reason: "calling the GitHub API is not allowed" },
  {
    pattern: /\brm\s+(?:-\S+\s+)*-\S*[rR]\S*\s+(?:-\S+\s+)*(?:\/|\/\*|~|~\/|\$HOME|\$\{HOME\})(?:\s|$)/,
    reason: "destructive rm is not allowed",
  },
];

const ALLOWED_ABSOLUTE_ROOTS = [
  "/usr/",
  "/bin/",
  "/sbin/",
  "/lib/",
  "/lib64/",
  "/tmp/",
  "/dev/null",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
];
const ABSOLUTE_PATH = /(?:^|[\s"'=(])(\/[^\s"'`;|&<>)]*)/g;

const inside = (path: string, dir: string) => {
  const normalized = posix.normalize(path);
  const root = posix.normalize(dir);

  return normalized === root || normalized.startsWith(`${root}/`);
};

/** Best-effort: returns the first absolute path that is neither inside one of `dirs` nor a harmless system location. */
export function pathOutside(text: string, dirs: readonly string[]): string | undefined {
  for (const match of text.matchAll(ABSOLUTE_PATH)) {
    const path = match[1]!;
    if (dirs.some((dir) => inside(path, dir))) continue;

    const normalized = posix.normalize(path);
    if (ALLOWED_ABSOLUTE_ROOTS.some((root) => normalized === root || normalized.startsWith(root))) continue;

    return path;
  }

  return undefined;
}

/** The issue's worktree, where the agent works, and its attached files, which it may only read. */
export type IssueDirs = { worktree: string; attachments: string };

/** Returns why a bash command must not run, or undefined when it may. */
export function bashViolation(command: string, dirs: IssueDirs): string | undefined {
  const blocked = BLOCKED_COMMANDS.find(({ pattern }) => pattern.test(command));
  if (blocked) return blocked.reason;

  const outside = pathOutside(command, [dirs.worktree, dirs.attachments]);

  return outside && `path outside the issue worktree: ${outside}`;
}

/** Returns why `read`, `write` or `edit` must not touch `path`, relative to the worktree, or undefined when it may. */
export function pathToolViolation(tool: string, path: string, dirs: IssueDirs): string | undefined {
  // Normalized as pi-durable's tools do, so the guard judges the path they open.
  const normalized = path.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ").replace(/^@/, "");
  // The tools expand these against the runner's home or a URL, which the guard can't resolve the same way.
  if (/^(~|file:)/.test(normalized)) return `use a plain path, not ~ or file: ${path}`;

  const resolved = posix.resolve(dirs.worktree, normalized);
  const writes = tool !== "read";
  if (writes && inside(resolved, dirs.attachments)) return `attached files are read-only: ${path}`;

  const outside = pathOutside(resolved, writes ? [dirs.worktree] : [dirs.worktree, dirs.attachments]);

  return outside && `path outside the issue worktree: ${path}`;
}

/** Assistant turns since `at`; a timestamp, not a context count, because compaction shrinks the context mid-run. */
export const turnsSince = (messages: readonly Message[], at: number) =>
  messages.filter((message) => message.role === "assistant" && message.timestamp >= at).length;

export const totalCostUsd = (usage: Readonly<UsageState> | undefined) =>
  usage
    ? [...Object.values(usage.models), ...Object.values(usage.tools)].reduce((sum, entry) => sum + entry.cost.total, 0)
    : 0;

export type Budgets = Pick<FactoryConfig, "maxTurns" | "maxCostUsd">;

export function budgetBreach(budgets: Budgets, spent: { turns: number; costUsd: number }): string | undefined {
  if (spent.turns >= budgets.maxTurns)
    return `turn budget exhausted (${spent.turns} of ${budgets.maxTurns} turns used)`;

  if (spent.costUsd >= budgets.maxCostUsd)
    return `cost budget exhausted ($${spent.costUsd.toFixed(4)} of $${budgets.maxCostUsd})`;
  return undefined;
}

/** When the run started and what the conversation had spent by then; budgets apply per run. */
export type RunStart = { at: number; costUsd: number };

/** The run's spend so far. `messages` are the model context. */
export const spentSince = (messages: readonly Message[], costUsd: number, from: RunStart | null | undefined) => ({
  turns: turnsSince(messages, from?.at ?? 0),
  costUsd: Math.max(0, costUsd - (from?.costUsd ?? 0)),
});

/** Why the current run must stop spending, or undefined while it is within its budgets. */
export async function runBudgetBreach(
  read: DocumentReader,
  conversationId: ConversationId,
  messages: readonly Message[],
  context: Context,
  budgets: Budgets,
): Promise<string | undefined> {
  const state = await read.snapshot(IssueState, conversationId, context);
  if (!state?.repo) return undefined;

  const costUsd = totalCostUsd(await read.snapshot(UsageDoc, conversationId, context));

  return budgetBreach(budgets, spentSince(messages, costUsd, state.budgetFrom));
}

export const lastAssistantText = (messages: readonly Message[]): string => {
  const last = messages.findLast((message): message is AssistantMessage => message.role === "assistant");
  return (
    last?.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("")
      .trim() ?? ""
  );
};

const PATH_TOOLS = new Set(["read", "write", "edit"]);

/**
 * Bash and file-path guards plus turn and cost budgets. A budget breach aborts the generation, so the run's submission
 * settles unanswered and the pipeline reports the breach.
 */
export function createGuards(opts: {
  config: Budgets;
  abortTask: (id: TaskId) => void;
  attachmentsPath: (repo: string, issue: number) => string;
}) {
  return defineExtension({
    name: "guards",
    hooks: [
      hook(ToolTask, {
        beforeTool: async (call, api, context) => {
          const state = await api.snapshot(IssueState, api.conversationId, context);
          if (!state || state.worktreePath === "") return undefined;

          const args = call.arguments as { command?: unknown; path?: unknown };
          const dirs = { worktree: state.worktreePath, attachments: opts.attachmentsPath(state.repo, state.issue) };

          let reason: string | undefined;
          if (call.name === "bash" && typeof args.command === "string") reason = bashViolation(args.command, dirs);
          if (PATH_TOOLS.has(call.name) && typeof args.path === "string")
            reason = pathToolViolation(call.name, args.path, dirs);

          return reason ? { block: `Blocked: ${reason}.` } : undefined;
        },
      }),
      hook(GenerationTask, {
        beforeRequest: async (request, api, context) => {
          if (await runBudgetBreach(api, api.conversationId, request.messages, context, opts.config))
            opts.abortTask(api.taskId);
          return undefined;
        },
      }),
    ],
  });
}
