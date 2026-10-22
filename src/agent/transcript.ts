import type { ImageContent, Message, TextContent } from "@earendil-works/pi-ai";
import type { TranscriptItem } from "../runStatus.ts";

const MAX_ITEM_CHARS = 4_000;

const clip = (value: string) => (value.length > MAX_ITEM_CHARS ? `${value.slice(0, MAX_ITEM_CHARS)}\n... (${value.length - MAX_ITEM_CHARS} more characters)` : value);

const textOf = (content: string | readonly (TextContent | ImageContent)[]) =>
  typeof content === "string" ? content : content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");

const SUMMARY_CHARS = 120;

const summarize = (args: Record<string, unknown>) => {
  const first = Object.values(args).find((value): value is string => typeof value === "string" && value.trim() !== "");
  const line = first?.trim().split("\n")[0] ?? "";
  return line.length > SUMMARY_CHARS ? `${line.slice(0, SUMMARY_CHARS)}...` : line;
};

/** The public projection of a conversation: no system prompt, thinking or images, each tool call paired with its result, and long text is clipped. */
export function toTranscript(messages: readonly Message[]): TranscriptItem[] {
  const results = new Map(
    messages.flatMap((message) =>
      message.role === "toolResult" ? [[message.toolCallId, { text: clip(textOf(message.content)), isError: message.isError }] as const] : [],
    ),
  );
  return messages.flatMap((message): TranscriptItem[] => {
    switch (message.role) {
      case "system":
        return [];
      case "user":
        return [{ kind: "user", text: clip(textOf(message.content)) }];
      case "assistant":
        return message.content.flatMap((part): TranscriptItem[] => {
          if (part.type === "text") return part.text.trim() ? [{ kind: "assistant", text: clip(part.text) }] : [];
          if (part.type === "toolCall") {
            const result = results.get(part.id);
            return [
              {
                kind: "tool",
                name: part.name,
                summary: summarize(part.arguments),
                args: clip(JSON.stringify(part.arguments, null, 2)),
                ...(result && { result }),
              },
            ];
          }
          return [];
        });
      case "toolResult":
        return [];
    }
  });
}
