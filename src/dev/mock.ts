import { deflateSync } from "node:zlib";
import { serve } from "@hono/node-server";
import { branchName, branchSlug, type IssueService } from "../contracts.ts";
import type { PrState, RunStatus, TranscriptItem } from "../runStatus.ts";
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
    branch: branchName(issue, branchSlug(title)),
    phase,
    attempts: 1,
    costUsd: 0.42,
    model: "gpt-6.2-sol",
    thinkingLevel: "high",
    prUrl: null,
    prState: null,
    lastError: null,
    startedAt: ago(30),
    updatedAt: ago(1),
    ...extra,
  };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Buffer) => (bytes.reduce((c, byte) => crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8), ~0) ^ ~0) >>> 0;

const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** A `width`×`height` RGB PNG that looks like a page screenshot: a header bar over rows of text lines. */
function screenshot(width: number, height: number, dark: boolean): Buffer {
  const [page, bar, line] = dark
    ? [
        [22, 25, 30],
        [36, 71, 245],
        [58, 63, 71],
      ]
    : [
        [255, 255, 255],
        [36, 71, 245],
        [214, 218, 224],
      ];

  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const inText = y > 70 && y % 28 < 10 && x > 32 && x < width - 32 - ((y * 7) % 180);
      const color = (y < 48 && bar) || (inText && line) || page;
      row.set(color, 1 + x * 3);
    }
    return row;
  });

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);

  return Buffer.concat([
    Buffer.from("\x89PNG\r\n\x1a\n", "latin1"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const SAMPLE_FILES: Record<string, Buffer> = {
  "issue/image-1.png": screenshot(960, 600, false),
  "issue/image-2.png": screenshot(600, 900, true),
  "issue/server.log": Buffer.from("12:04:31 GET /status 200 4ms\n12:04:32 GET /status/stream 200 open\n"),
  "review-1/image-1.png": screenshot(390, 760, true),
};

const ASSET = "https://github.com/user-attachments/assets";
const FILES = "https://github.com/user-attachments/files";

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
    files: [
      { name: "image-1.png", source: `${ASSET}/1f0c`, path: "issue/image-1.png" },
      { name: "image-2.png", source: `${ASSET}/2a7d`, path: "issue/image-2.png" },
      { name: "server.log", source: `${FILES}/3/server.log`, path: "issue/server.log" },
      {
        name: "night-mode-research.pdf",
        source: `${FILES}/4/night-mode-research.pdf`,
        skipped: "file exceeds the 10 MiB size limit",
      },
    ],
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

  { kind: "assistant", text: "The typecheck fails because `dark` is read as a", interrupted: true },

  { kind: "human", text: "Please use the system preference by default." },

  {
    kind: "assistant",
    text: 'Got it. I\'ll default to `prefers-color-scheme` and keep the toggle as an override.\n\n```ts\nconst dark = matchMedia("(prefers-color-scheme: dark)").matches;\ndocument.documentElement.dataset.theme = stored ?? (dark ? "dark" : "light");\n```\n\nSee [MDN](https://developer.mozilla.org/docs/Web/CSS/@media/prefers-color-scheme) for details.',
  },

  { kind: "tool", name: "edit", summary: "web/src/App.vue", args: '{ "path": "web/src/App.vue" }' },

  {
    kind: "human",
    text: "Keep the toggle out of the mobile header.",
    review: {
      reviewer: "example",
      state: "changes_requested",
      url: "https://github.com/example/mike-factory/pull/32#pullrequestreview-1",
      comments: [
        {
          path: "web/src/App.vue",
          line: 14,
          body: "Read the stored theme once, not on every render.",
          url: "https://github.com/example/mike-factory/pull/32#discussion_r1",
        },
        {
          path: "web/src/style.css",
          line: 3,
          body: "Why a new token here?",
          url: "https://github.com/example/mike-factory/pull/32#discussion_r2",
        },
      ],
    },
    files: [{ name: "image-1.png", source: `${ASSET}/9c3e`, path: "review-1/image-1.png" }],
  },
];

const LIVE_ANSWER = "Running the tests to check the toggle in both themes, then I'll commit.";
const LIVE_OUTPUT = [
  "> vitest run",
  "",
  " ✓ src/theme.test.ts (3 tests) 12ms",
  " ✓ src/components/Header.test.ts (5 tests) 31ms",
  " ✓ src/components/StatusList.test.ts (8 tests) 48ms",
  "",
  " Test Files  3 passed (3)",
  "      Tests  16 passed (16)",
];
const LIVE_PAUSE_TICKS = 8;

/** A run in progress at `tick`: the answer streams word by word, then a tool runs, then the agent idles a while. */
function liveTail(tick: number): TranscriptItem[] {
  const words = LIVE_ANSWER.split(" ");
  const answer = { kind: "assistant", text: LIVE_ANSWER } as const;
  const tool = { kind: "tool", name: "bash", summary: "pnpm test", args: '{ "command": "pnpm test" }' } as const;
  const busy = { kind: "busy" } as const;

  const t = tick % (words.length + LIVE_OUTPUT.length + LIVE_PAUSE_TICKS);
  if (t < words.length) return [{ ...answer, text: words.slice(0, t + 1).join(" "), streaming: true }, busy];

  const lines = t - words.length + 1;
  if (lines <= LIVE_OUTPUT.length) return [answer, { ...tool, output: LIVE_OUTPUT.slice(0, lines).join("\n") }, busy];

  return [answer, { ...tool, result: { text: LIVE_OUTPUT.join("\n"), isError: false } }];
}

const IDLE: RunStatus["phase"][] = ["review", "merged", "closed", "done", "failed", "aborted"];

const FAILURES = [
  "verify: `pnpm test` failed 3 times",
  "no changes: the agent produced no commits",
  "run budget exceeded: $5.00",
];

/** Enough older finished runs across repos and weeks to scroll through. */
function history(): RunStatus[] {
  const repos = ["mike-factory", "web-shop", "docs-site"];

  return Array.from({ length: 90 }, (_, i) => {
    const finished = 30 * 60 + i * 9 * 60;
    const prState: PrState = i % 3 === 0 ? "closed" : "merged";

    let phase: RunStatus["phase"] = prState;
    if (i % 13 === 4) phase = "done";
    if (i % 7 === 3) phase = "failed";
    if (i % 11 === 5) phase = "aborted";

    const published = phase === prState;

    return run(repos[i % repos.length]!, 100 + i, `Historic change number ${i + 1}`, phase, {
      costUsd: 0.15 + ((i * 37) % 100) / 40 + (i % 17 === 2 ? 4 : 0),
      model: i % 4 === 1 ? "gpt-6.1-terra" : "gpt-6.2-sol",
      attempts: i % 5 === 1 ? 2 : 0,
      lastError: phase === "failed" ? FAILURES[i % FAILURES.length]! : null,
      prUrl: published ? `https://github.com/example/pull/${200 + i}` : null,
      prState: published ? prState : null,
      startedAt: ago(finished + 20 + (i % 5) * 15 + ((i * 53) % 90)),
      updatedAt: ago(finished),
    });
  });
}

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
    run("mike-factory", 29, "Show the queue position on queued runs", "review", {
      prUrl: "https://github.com/example/mike-factory/pull/33",
      prState: "open",
      startedAt: ago(300),
      updatedAt: ago(260),
      costUsd: 0.94,
    }),
    run("docs-site", 4, "Document the runner container setup", "review", {
      prUrl: "https://github.com/example/docs-site/pull/5",
      prState: "open",
      startedAt: ago(90),
      updatedAt: ago(70),
      costUsd: 0.37,
    }),
    run("web-shop", 9, "Show delivery estimates on the product page", "merged", {
      prUrl: "https://github.com/example/web-shop/pull/14",
      prState: "merged",
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
    ...history(),
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
    "review",
    "merged",
    "failed",
    "aborted",
  ];
  const demo = run("phase-demo", 1, "Walk through every phase", "queued", { startedAt: ago(0), updatedAt: ago(0) });
  runs.unshift(demo);
  conversations.set(key(demo.repo, demo.issue), sampleConversation());

  const streaming = conversations.get(key("mike-factory", 31))!;
  const stopped = conversations.get(key("web-shop", 7))!;
  stopped.push({ kind: "failure", reason: "aborted", detail: "Stopped from the issue with /mike stop." });

  let tick = 0;
  const items = (k: string) => {
    const conversation = conversations.get(k);
    return conversation === streaming ? [...conversation, ...liveTail(tick)] : conversation;
  };

  setInterval(() => {
    tick++;
    notify(transcriptListeners.get(key("mike-factory", 31)));
  }, 400);
  setInterval(() => {
    demo.phase = cycle[(cycle.indexOf(demo.phase) + 1) % cycle.length]!;
    demo.updatedAt = new Date().toISOString();
    notify(statusListeners);
  }, 2000);

  return {
    start: async () => {},
    stop: async () => {},
    feedback: async () => {},
    prState: async () => {},
    sweep: async () => {},
    status: async () => runs,
    transcript: async (repo, issue) => items(key(repo, issue)),
    attachment: async (repo, issue, path) => (conversations.has(key(repo, issue)) ? SAMPLE_FILES[path] : undefined),
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => void statusListeners.delete(listener);
    },
    async watchTranscript(repo, issue, listener) {
      const k = key(repo, issue);
      if (!conversations.has(k)) return undefined;
      const listeners = transcriptListeners.get(k) ?? new Set();
      transcriptListeners.set(k, listeners);
      listeners.add(listener);
      return { items: async () => items(k) ?? [], stop: () => void listeners.delete(listener) };
    },
    async message({ repo, issue, text }) {
      const k = key(repo, issue);
      const conversation = conversations.get(k);
      const target = runs.find((r) => key(r.repo, r.issue) === k);
      if (!conversation || !target) return "not_found";

      const result = IDLE.includes(target.phase) ? "started" : "steered";
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
