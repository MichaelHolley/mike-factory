import type { Message } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";
import { describe, expect, it } from "vitest";
import { HUMAN_ENTRY } from "./docs.ts";
import { toTranscript } from "./transcript.ts";

type Entry = { kind: string; data?: unknown; model: Message[] };
const viewOf = (entries: (Message | Entry)[]) => {
  const all = entries.map((entry) => ("role" in entry ? { kind: `pi.${entry.role}`, model: [entry] } : entry));
  return {
    entries: all.map(({ kind, data }) => ({ kind, data }) as EntryRecord),
    contributions: all.map(({ model }) => model),
  };
};

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

describe("toTranscript", () => {
  it("keeps what was said and done, and drops the system prompt, thinking and images", () => {
    const messages = [
      { role: "system", content: "secret rules" },
      {
        role: "user",
        content: [
          { type: "text", text: "Implement it" },
          { type: "image", data: "AAAA", mimeType: "image/png" },
        ],
        timestamp: 1,
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "private thoughts" },
          { type: "text", text: "Writing the file." },
          { type: "toolCall", id: "1", name: "write", arguments: { path: "a.txt" } },
        ],
        api: "faux",
        provider: "faux",
        model: "faux",
        usage,
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "1",
        toolName: "write",
        content: [{ type: "text", text: "ok" }],
        isError: false,
        timestamp: 3,
      },
    ] as unknown as Message[];

    expect(toTranscript(viewOf(messages))).toEqual([
      { kind: "user", text: "Implement it" },
      { kind: "assistant", text: "Writing the file." },
      {
        kind: "tool",
        name: "write",
        summary: "a.txt",
        args: JSON.stringify({ path: "a.txt" }, null, 2),
        result: { text: "ok", isError: false },
      },
    ]);
  });

  it("leaves a tool call without a result while it is still running", () => {
    const command = "pnpm test\npnpm lint";
    const messages = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "1", name: "bash", arguments: { command } }],
        timestamp: 1,
      },
    ] as unknown as Message[];

    expect(toTranscript(viewOf(messages))).toEqual([
      { kind: "tool", name: "bash", summary: "pnpm test", args: JSON.stringify({ command }, null, 2) },
    ]);
  });

  it("clips long text", () => {
    const messages = [{ role: "user", content: "x".repeat(10_000), timestamp: 1 }] as Message[];
    const [item] = toTranscript(viewOf(messages));
    expect(item!.kind === "user" && item!.text.length).toBeLessThan(4_100);
    expect(item).toMatchObject({ text: expect.stringContaining("6000 more characters") });
  });

  it("includes each owner message once and marks undelivered messages as pending", () => {
    const prompt = { role: "user", content: "<owner-message>Use tabs</owner-message>", timestamp: 1 } as Message;
    const view = viewOf([
      { kind: HUMAN_ENTRY, data: { id: "a", text: "Use tabs" }, model: [prompt] },
      { role: "assistant", content: [{ type: "text", text: "Switched." }], timestamp: 2 } as unknown as Message,
    ]);

    expect(
      toTranscript(view, [
        { id: "a", text: "Use tabs" },
        { id: "b", text: "Also docs" },
      ]),
    ).toEqual([
      { kind: "human", text: "Use tabs" },
      { kind: "assistant", text: "Switched." },
      { kind: "human", text: "Also docs", pending: true },
    ]);
  });

  it("shows a review note with its review card", () => {
    const review = {
      reviewer: "owner",
      state: "changes_requested",
      body: "Please rename",
      url: "https://github.com/o/r/pull/3#pullrequestreview-7",
      comments: [
        {
          id: 81,
          threadRootId: 81,
          path: "src/a.ts",
          line: 4,
          diffHunk: "@@ -1 +1 @@",
          body: "Use a map",
          url: "https://github.com/o/r/pull/3#discussion_r81",
          thread: [],
        },
      ],
    };
    const prompt = { role: "user", content: "<review>...</review>", timestamp: 1 } as Message;
    const view = viewOf([
      { kind: HUMAN_ENTRY, data: { id: "review-7", text: "Please rename", review }, model: [prompt] },
    ]);

    expect(toTranscript(view)).toEqual([
      {
        kind: "human",
        text: "Please rename",
        review: {
          reviewer: "owner",
          state: "changes_requested",
          url: review.url,
          comments: [{ path: "src/a.ts", line: 4, body: "Use a map", url: review.comments[0]!.url }],
        },
      },
    ]);
  });
});
