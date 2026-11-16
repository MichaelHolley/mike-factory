import type { JsonValue } from "@earendil-works/chord/json";
import type { ImageContent, Message, TextContent } from "@earendil-works/pi-ai";
import type { EntryRecord, LiveState } from "@earendil-works/pi-durable";
import type { ReviewFeedback } from "../contracts.ts";
import type { ReviewCard, TranscriptItem } from "../runStatus.ts";
import { HUMAN_ENTRY } from "./docs.ts";

const MAX_ITEM_CHARS = 4_000;

const clip = (value: string) =>
  value.length > MAX_ITEM_CHARS
    ? `${value.slice(0, MAX_ITEM_CHARS)}\n... (${value.length - MAX_ITEM_CHARS} more characters)`
    : value;

// Running output grows at its end, so the newest part is what matters.
const clipStart = (value: string) =>
  value.length > MAX_ITEM_CHARS
    ? `... (${value.length - MAX_ITEM_CHARS} earlier characters)\n${value.slice(-MAX_ITEM_CHARS)}`
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

// Failed answers, which the model's context leaves out too. It leaves out aborted ones as well, but their text is
// what the owner watched stream in before it was cut off.
const UNSHOWN_STOP_REASONS = new Set(["error", "deferred"]);

const shownMessages = (entry: EntryRecord) =>
  (entry.model ?? []).filter(
    (message) => message.role !== "assistant" || !UNSHOWN_STOP_REASONS.has(message.stopReason),
  );

type Calls = {
  results: Map<string, { text: string; isError: boolean }>;
  outputs: Map<string, string>;
};

/**
 * The public projection of a conversation's entries: no system prompt, thinking or images, each tool call paired with
 * its result, and long text is clipped. An aborted answer keeps only its text, marked `interrupted`. Owner messages
 * show as `human` items, followed by `queued` ones the agent hasn't seen yet. `live`, the conversation's `pi.live`,
 * adds the answer being streamed, the output of running tools, and at the end whether the agent is busy and why its
 * last run ended without an answer.
 */
export function toTranscript(
  entries: readonly EntryRecord[],
  { queued = [], live }: { queued?: readonly HumanMessage[]; live?: LiveState } = {},
): TranscriptItem[] {
  const contributions = entries.map(shownMessages);
  const calls: Calls = {
    results: new Map(
      contributions
        .flat()
        .flatMap((message) =>
          message.role === "toolResult"
            ? [[message.toolCallId, { text: clip(textOf(message.content)), isError: message.isError }] as const]
            : [],
        ),
    ),
    outputs: new Map(
      (live?.tools ?? []).flatMap((slot) =>
        slot.status === "running" ? [[slot.callId, clipStart(slot.output ?? "")] as const] : [],
      ),
    ),
  };
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
      : contributions[index]!.flatMap((message) => itemsOf(message, calls)),
  );
  const streaming = (live?.generation?.message?.content ?? []).flatMap((part): TranscriptItem[] =>
    part.type === "text" && part.text.trim() ? [{ kind: "assistant", text: clip(part.text), streaming: true }] : [],
  );
  const retry = live?.generation?.retry?.error;
  const failure = live?.runFailure;
  return [
    ...placed,
    ...streaming,
    ...queued.flatMap((message) => human(message, true)),
    ...(live?.run ? [{ kind: "busy" as const, ...(retry && { retry: clip(retry) }) }] : []),
    ...(failure
      ? [{ kind: "failure" as const, reason: failure.reason, ...(failure.detail && { detail: clip(failure.detail) }) }]
      : []),
  ];
}

function itemsOf(message: Message, { results, outputs }: Calls): TranscriptItem[] {
  switch (message.role) {
    case "system":
      return [];
    case "user":
      return [{ kind: "user", text: clip(textOf(message.content)) }];
    case "assistant": {
      const interrupted = message.stopReason === "aborted";
      return message.content.flatMap((part): TranscriptItem[] => {
        if (part.type === "text") {
          return part.text.trim()
            ? [{ kind: "assistant", text: clip(part.text), ...(interrupted && { interrupted: true as const }) }]
            : [];
        }
        if (part.type === "toolCall" && !interrupted) {
          const result = results.get(part.id);
          const output = result ? undefined : outputs.get(part.id);
          return [
            {
              kind: "tool",
              name: part.name,
              summary: summarize(part.arguments),
              args: clip(JSON.stringify(part.arguments, null, 2)),
              ...(result && { result }),
              ...(output !== undefined && { output }),
            },
          ];
        }
        return [];
      });
    }
    case "toolResult":
      return [];
  }
}
