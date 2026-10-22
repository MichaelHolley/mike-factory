import type { Message } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { toTranscript } from "./transcript.ts";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

describe("toTranscript", () => {
  it("keeps what was said and done, and drops the system prompt, thinking and images", () => {
    const messages = [
      { role: "system", content: "secret rules" },
      { role: "user", content: [{ type: "text", text: "Implement it" }, { type: "image", data: "AAAA", mimeType: "image/png" }], timestamp: 1 },
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
      { role: "toolResult", toolCallId: "1", toolName: "write", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 3 },
    ] as unknown as Message[];

    expect(toTranscript(messages)).toEqual([
      { kind: "user", text: "Implement it" },
      { kind: "assistant", text: "Writing the file." },
      { kind: "tool", name: "write", summary: "a.txt", args: JSON.stringify({ path: "a.txt" }, null, 2), result: { text: "ok", isError: false } },
    ]);
  });

  it("leaves a tool call without a result while it is still running", () => {
    const command = "pnpm test\npnpm lint";
    const messages = [
      { role: "assistant", content: [{ type: "toolCall", id: "1", name: "bash", arguments: { command } }], timestamp: 1 },
    ] as unknown as Message[];

    expect(toTranscript(messages)).toEqual([
      { kind: "tool", name: "bash", summary: "pnpm test", args: JSON.stringify({ command }, null, 2) },
    ]);
  });

  it("clips long text", () => {
    const messages = [{ role: "user", content: "x".repeat(10_000), timestamp: 1 }] as Message[];
    const [item] = toTranscript(messages);
    expect(item!.kind === "user" && item!.text.length).toBeLessThan(4_100);
    expect(item).toMatchObject({ text: expect.stringContaining("6000 more characters") });
  });
});
