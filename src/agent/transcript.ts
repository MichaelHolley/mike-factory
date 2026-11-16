import type { JsonValue } from "@earendil-works/chord/json";
import type { ImageContent, Message, TextContent } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";
import type { ReviewFeedback } from "../contracts.ts";
import type { ReviewCard, TranscriptItem } from "../runStatus.ts";
import { HUMAN_ENTRY } from "./docs.ts";

const MAX_ITEM_CHARS = 4_000;

const clip = (value: string) =>
  value.length > MAX_ITEM_CHARS
    ? `${value.slice(0, MAX_ITEM_CHARS)}\n... (${value.length - MAX_ITEM_CHARS} more characters)`
    : value;

const textOf = (content: string | readonly (TextContent | ImageContent)[]) =>
  typeof content === "string" ? content : content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");

const SUMMARY_CHARS = 120;

const summarize = (args: Record<string, unknown>) => {
  const first = Object.values(args).find((value): value is string => typeof value === "string" && value.trim() !== "");
  const line = first?.trim().split("\n")[0] ?? "";
  return line.length > SUMMARY_CHARS ? `${line.slice(0, SUMMARY_CHARS)}...` : line;
};

export type HumanMessage = { id: string; text: string; review?: ReviewFeedback };

/** The `{ id, text, review? }` of an owner message entry's data, or undefined for anything else. */
export const humanMessage = (data: JsonValue | undefined): HumanMessage | undefined => {
  const { id, text, review } = (data ?? {}) as Partial<Record<string, unknown>>;
  if (typeof id !== "string" || typeof text !== "string") return undefined;
  return review && typeof review === "object" ? { id, text, review: review as ReviewFeedback } : { id, text };
};

const reviewCard = ({ reviewer, state, url, comments }: ReviewFeedback): ReviewCard => ({
  reviewer,
  state,
  url,
  comments: comments.map(({ path, line, body, url }) => ({ path, line, body: clip(body), url })),
});

// Failed and cut-off answers, which the model's context leaves out too.
const UNSHOWN_STOP_REASONS = new Set(["aborted", "error", "deferred"]);

const shownMessages = (entry: EntryRecord) =>
  (entry.model ?? []).filter(
    (message) => message.role !== "assistant" || !UNSHOWN_STOP_REASONS.has(message.stopReason),
  );

/**
 * The public projection of a conversation's entries: no system prompt, thinking or images, each tool call paired with
 * its result, and long text is clipped. Owner messages show as `human` items, followed by `queued` ones the agent
 * hasn't seen yet.
 */
export function toTranscript(entries: readonly EntryRecord[], queued: readonly HumanMessage[] = []): TranscriptItem[] {
  const contributions = entries.map(shownMessages);
  const results = new Map(
    contributions
      .flat()
      .flatMap((message) =>
        message.role === "toolResult"
          ? [[message.toolCallId, { text: clip(textOf(message.content)), isError: message.isError }] as const]
          : [],
      ),
  );
  const shown = new Set<string>();
  const human = (message: HumanMessage | undefined, pending: boolean): TranscriptItem[] => {
    if (!message || shown.has(message.id)) return [];
    shown.add(message.id);
    return [
      {
        kind: "human",
        text: clip(message.text),
        ...(pending && { pending: true as const }),
        ...(message.review && { review: reviewCard(message.review) }),
      },
    ];
  };
  const placed = entries.flatMap((entry, index): TranscriptItem[] =>
    entry.kind === HUMAN_ENTRY
      ? human(humanMessage(entry.data), false)
      : contributions[index]!.flatMap((message) => itemsOf(message, results)),
  );
  return [...placed, ...queued.flatMap((message) => human(message, true))];
}

function itemsOf(message: Message, results: Map<string, { text: string; isError: boolean }>): TranscriptItem[] {
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
}
