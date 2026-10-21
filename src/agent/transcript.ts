import type { ImageContent, Message, TextContent } from "@earendil-works/pi-ai";
import type { TranscriptItem } from "../runStatus.ts";

const MAX_ITEM_CHARS = 4_000;

const clip = (value: string) => (value.length > MAX_ITEM_CHARS ? `${value.slice(0, MAX_ITEM_CHARS)}\n... (${value.length - MAX_ITEM_CHARS} more characters)` : value);

const textOf = (content: string | readonly (TextContent | ImageContent)[]) =>
  typeof content === "string" ? content : content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");

/** The public projection of a conversation: no system prompt, thinking or images, and long text is clipped. */
export function toTranscript(messages: readonly Message[]): TranscriptItem[] {
  return messages.flatMap((message): TranscriptItem[] => {
    switch (message.role) {
      case "system":
        return [];
      case "user":
        return [{ kind: "user", text: clip(textOf(message.content)) }];
      case "assistant":
        return message.content.flatMap((part): TranscriptItem[] => {
          if (part.type === "text") return part.text.trim() ? [{ kind: "assistant", text: clip(part.text) }] : [];
          if (part.type === "toolCall") return [{ kind: "tool-call", name: part.name, args: clip(JSON.stringify(part.arguments, null, 2)) }];
          return [];
        });
      case "toolResult":
        return [{ kind: "tool-result", name: message.toolName, text: clip(textOf(message.content)), isError: message.isError }];
    }
  });
}
