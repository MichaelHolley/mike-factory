import { createServer, type ServerResponse } from "node:http";
import type { RunStatus, TranscriptItem } from "../../src/runStatus.ts";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function run(repo: string, issue: number, phase: RunStatus["phase"], extra: Partial<RunStatus> = {}): RunStatus {
  return {
    repo,
    issue,
    issueUrl: `https://github.com/example/${repo}/issues/${issue}`,
    branch: `mike/${issue}-sample`,
    phase,
    attempts: 1,
    costUsd: 0.42,
    prUrl: null,
    lastError: null,
    startedAt: ago(30),
    updatedAt: ago(1),
    ...extra,
  };
}

const runs: RunStatus[] = [
  run("mike-factory", 31, "implement", { startedAt: ago(4), updatedAt: ago(0), costUsd: 0.18 }),
  run("mike-factory", 30, "fix", { attempts: 2, costUsd: 1.07 }),
  run("web-shop", 12, "queued", { startedAt: null, updatedAt: null, costUsd: 0 }),
  run("web-shop", 9, "done", {
    prUrl: "https://github.com/example/web-shop/pull/14",
    startedAt: ago(180),
    updatedAt: ago(150),
    costUsd: 2.31,
  }),
  run("mike-factory", 27, "failed", {
    attempts: 3,
    lastError: "verify: `pnpm test` failed 3 times (test/agent/crash.test.ts)",
    startedAt: ago(600),
    updatedAt: ago(540),
  }),
  run("web-shop", 7, "aborted", { startedAt: ago(1500), updatedAt: ago(1490), costUsd: 0.05 }),
];

const sampleConversation = (): TranscriptItem[] => [
  { kind: "user", text: "Implement issue #31: add a dark mode toggle to the status page.\n\nKeep the change small." },
  { kind: "assistant", text: "I'll look at how the styles are organised first." },
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
  { kind: "assistant", text: "Got it. I'll default to `prefers-color-scheme` and keep the toggle as an override." },
  { kind: "tool", name: "edit", summary: "web/src/App.vue", args: '{ "path": "web/src/App.vue" }' },
];

const conversations = new Map(runs.map((r) => [`${r.repo}/${r.issue}`, sampleConversation()]));
const listeners = new Map<string, Set<ServerResponse>>();

function openStream(res: ServerResponse, key: string, items: unknown[]) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.write(`data: ${JSON.stringify({ from: 0, items })}\n\n`);
  const set = listeners.get(key) ?? new Set();
  set.add(res);
  listeners.set(key, set);
  res.on("close", () => set.delete(res));
}

function push(key: string, from: number, items: unknown[]) {
  for (const res of listeners.get(key) ?? []) res.write(`data: ${JSON.stringify({ from, items })}\n\n`);
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const FINISHED = ["done", "failed", "aborted"];

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/status") return json(res, 200, runs);
  if (url.pathname === "/status/stream") return openStream(res, "runs", runs);

  const match = url.pathname.match(/^\/status\/([^/]+)\/(\d+)\/(conversation(?:\/stream)?|messages)$/);
  const key = match ? `${decodeURIComponent(match[1]!)}/${match[2]}` : "";
  const conversation = conversations.get(key);
  const target = runs.find((r) => `${r.repo}/${r.issue}` === key);
  if (!match || !conversation || !target) return json(res, 404, { error: "not found" });

  if (match[3] === "conversation") {
    const download = url.searchParams.has("download");
    return json(res, 200, conversation, download ? { "content-disposition": `attachment; filename="run.json"` } : {});
  }
  if (match[3] === "conversation/stream") return openStream(res, key, conversation);

  if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
  let body = "";
  for await (const chunk of req) body += chunk;
  const { text } = JSON.parse(body) as { id: string; text: string };
  const result = FINISHED.includes(target.phase) ? "started" : "steered";
  conversation.push({ kind: "human", text, pending: true });
  push(key, conversation.length - 1, conversation.slice(-1));
  if (result === "started") {
    target.phase = "prepare";
    target.updatedAt = new Date().toISOString();
    push("runs", 0, runs);
  }
  setTimeout(() => {
    conversation.push({ kind: "assistant", text: `(sample reply) Noted: “${text.slice(0, 80)}”` });
    const from = conversation.findIndex((item) => item.kind === "human" && item.pending);
    if (from >= 0) conversation[from] = { kind: "human", text: (conversation[from] as { text: string }).text };
    const start = from >= 0 ? from : conversation.length - 1;
    push(key, start, conversation.slice(start));
  }, 1500);
  return json(res, 202, { result });
}).listen(3000, "127.0.0.1", () => console.log("sample status server on http://localhost:3000"));
