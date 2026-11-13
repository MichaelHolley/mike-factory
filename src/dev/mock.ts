import { serve } from "@hono/node-server";
import { branchName, type IssueService } from "../contracts.ts";
import type { RunStatus, TranscriptItem } from "../runStatus.ts";
import { createServer } from "../server.ts";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function run(
  repo: string,
  issue: number,
  title: string,
  phase: RunStatus["phase"],
  extra: Partial<RunStatus> = {},
): RunStatus {
  return {
    repo,
    issue,
    issueUrl: `https://github.com/example/${repo}/issues/${issue}`,
    title,
    branch: branchName(issue),
    phase,
    attempts: 1,
    costUsd: 0.42,
    model: "gpt-6.1-sol",
    thinkingLevel: "high",
    prUrl: null,
    lastError: null,
    startedAt: ago(30),
    updatedAt: ago(1),
    ...extra,
  };
}

const sampleConversation = (): TranscriptItem[] => [
  {
    kind: "user",
    text: [
      "Implement issue #31: add a dark mode toggle to the status page.",
      "",
      "## Issue",
      "",
      "The status page is hard to read at night. Add a toggle in the header that switches between light and dark.",
      "",
      "## Rules",
      "",
      "- Keep the change small.",
      "- Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before you finish.",
      "- Commit locally; the pipeline pushes and opens the pull request.",
      "",
      "## Repository notes",
      "",
      "The web UI lives in `web/` and uses Vue 3 with plain CSS custom properties in `web/src/style.css`.",
    ].join("\n"),
  },
  {
    kind: "assistant",
    text: "I'll look at how the styles are organised first. The plan:\n\n- read `web/src/style.css`\n- find where the colours are defined\n- add a **toggle** in the header",
  },
  {
    kind: "tool",
    name: "bash",
    summary: "ls web/src",
    args: '{ "command": "ls web/src" }',
    result: { text: "App.vue\ncomponents\ncomposables\nmain.ts\nstyle.css", isError: false },
  },
  {
    kind: "tool",
    name: "read",
    summary: "web/src/style.css",
    args: '{ "path": "web/src/style.css" }',
    result: { text: ":root {\n  --bg: #fff;\n  --fg: #111;\n}", isError: false },
  },
  {
    kind: "tool",
    name: "bash",
    summary: "pnpm typecheck",
    args: '{ "command": "pnpm typecheck" }',
    result: {
      text: "src/App.vue:12:3 - error TS2322: Type 'string' is not assignable to type 'boolean'.",
      isError: true,
    },
  },
  { kind: "human", text: "Please use the system preference by default." },
  {
    kind: "assistant",
    text: 'Got it. I\'ll default to `prefers-color-scheme` and keep the toggle as an override.\n\n```ts\nconst dark = matchMedia("(prefers-color-scheme: dark)").matches;\ndocument.documentElement.dataset.theme = stored ?? (dark ? "dark" : "light");\n```\n\nSee [MDN](https://developer.mozilla.org/docs/Web/CSS/@media/prefers-color-scheme) for details.',
  },
  { kind: "tool", name: "edit", summary: "web/src/App.vue", args: '{ "path": "web/src/App.vue" }' },
];

const FINISHED: RunStatus["phase"][] = ["done", "failed", "aborted"];

/** In-memory runs and conversations; messages get a canned reply instead of reaching an agent. */
function createMockService(): IssueService {
  const runs: RunStatus[] = [
    run("mike-factory", 31, "Add a dark mode toggle to the status page", "implement", {
      startedAt: ago(4),
      updatedAt: ago(0),
      costUsd: 0.18,
    }),
    run("mike-factory", 30, "Retry flaky webhook deliveries with exponential backoff", "fix", {
      attempts: 2,
      costUsd: 1.07,
      thinkingLevel: "low",
    }),
    run("web-shop", 12, "Checkout button stays disabled after removing a coupon", "queued", {
      startedAt: null,
      updatedAt: null,
      costUsd: 0,
    }),
    run("web-shop", 9, "Show delivery estimates on the product page", "done", {
      prUrl: "https://github.com/example/web-shop/pull/14",
      startedAt: ago(180),
      updatedAt: ago(150),
      costUsd: 2.31,
    }),
    run("mike-factory", 27, "Recover worktrees after the server crashes mid-run", "failed", {
      attempts: 3,
      model: null,
      thinkingLevel: null,
      lastError: "verify: `pnpm test` failed 3 times (test/agent/crash.test.ts)",
      startedAt: ago(600),
      updatedAt: ago(540),
    }),
    run("web-shop", 7, "Translate the footer", "aborted", {
      startedAt: ago(1500),
      updatedAt: ago(1490),
      costUsd: 0.05,
    }),
  ];
  const key = (repo: string, issue: number) => `${repo}/${issue}`;
  const conversations = new Map(runs.map((r) => [key(r.repo, r.issue), sampleConversation()]));
  const statusListeners = new Set<() => void>();
  const transcriptListeners = new Map<string, Set<() => void>>();
  const notify = (listeners: Set<() => void> | undefined) => listeners?.forEach((listener) => listener());

  const cycle: RunStatus["phase"][] = [
    "queued",
    "prepare",
    "implement",
    "verify",
    "fix",
    "revise",
    "publish",
    "report",
    "done",
    "failed",
    "aborted",
  ];
  const demo = run("phase-demo", 1, "Walk through every phase", "queued", { startedAt: ago(0), updatedAt: ago(0) });
  runs.unshift(demo);
  conversations.set(key(demo.repo, demo.issue), sampleConversation());
  setInterval(() => {
    demo.phase = cycle[(cycle.indexOf(demo.phase) + 1) % cycle.length]!;
    demo.updatedAt = new Date().toISOString();
    notify(statusListeners);
  }, 2000);

  return {
    start: async () => {},
    stop: async () => {},
    cleanup: async () => {},
    sweep: async () => {},
    status: async () => runs,
    transcript: async (repo, issue) => conversations.get(key(repo, issue)),
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => void statusListeners.delete(listener);
    },
    async subscribeTranscript(repo, issue, listener) {
      const k = key(repo, issue);
      if (!conversations.has(k)) return undefined;
      const listeners = transcriptListeners.get(k) ?? new Set();
      transcriptListeners.set(k, listeners);
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async message({ repo, issue, text }) {
      const k = key(repo, issue);
      const conversation = conversations.get(k);
      const target = runs.find((r) => key(r.repo, r.issue) === k);
      if (!conversation || !target) return "not_found";

      const result = FINISHED.includes(target.phase) ? "started" : "steered";
      const item: TranscriptItem = { kind: "human", text, pending: true };
      conversation.push(item);
      notify(transcriptListeners.get(k));
      if (result === "started") {
        target.phase = "prepare";
        target.updatedAt = new Date().toISOString();
        notify(statusListeners);
      }
      setTimeout(() => {
        delete item.pending;
        conversation.push({ kind: "assistant", text: `(sample reply) Noted: “${text.slice(0, 80)}”` });
        notify(transcriptListeners.get(k));
      }, 1500);
      return result;
    },
  };
}

const log = (msg: string, data: object = {}) => console.log(JSON.stringify({ msg, ...data }));
const port = Number(process.env.PORT ?? 3000);
const app = createServer({ service: createMockService(), log });
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => log(`sample status server on http://localhost:${port}`));
