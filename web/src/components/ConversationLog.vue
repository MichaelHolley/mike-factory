<script setup lang="ts">
import { computed } from "vue";
import type { TranscriptItem } from "../../../src/runStatus.ts";
import { useTranscript } from "../composables/useTranscript.ts";
import MarkdownText from "./MarkdownText.vue";
import PipelineMessage from "./PipelineMessage.vue";
import ToolCall from "./ToolCall.vue";

type Message = Exclude<TranscriptItem, { kind: "tool" }>;
type Call = Extract<TranscriptItem, { kind: "tool" }>;
type Entry = { kind: "message"; message: Message } | { kind: "tools"; calls: Call[] };

const MAX_MARKS = 32;

const props = defineProps<{ repo: string; issue: string }>();
const { items, error, loaded, downloadUrl } = useTranscript(
  () => props.repo,
  () => props.issue,
);

const entries = computed(() =>
  items.value.reduce<Entry[]>((entries, item) => {
    const last = entries.at(-1);
    if (item.kind !== "tool") entries.push({ kind: "message", message: item });
    else if (last?.kind === "tools") last.calls.push(item);
    else entries.push({ kind: "tools", calls: [item] });
    return entries;
  }, []),
);

const tally = (calls: Call[]) =>
  [
    ...calls.reduce(
      (counts, call) => counts.set(call.name, (counts.get(call.name) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ]
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(", ");

const ROLES: Record<Message["kind"], string> = { user: "Pipeline", assistant: "Agent", human: "You" };

const speaker = (entry: Entry) => (entry.kind === "tools" ? "assistant" : entry.message.kind);
const startsTurn = (index: number) =>
  index === 0 || speaker(entries.value[index - 1]!) !== speaker(entries.value[index]!);

const tone = (call: Call) => (call.result ? (call.result.isError ? "bg-bad" : "bg-muted/55") : "bg-run");

const SAY = "col-2 min-w-0 max-sm:col-1";
const WHO: Record<Message["kind"], string> = { user: "pt-3.5 text-muted", assistant: "", human: "pt-2.5 text-you" };
const TEXT: Record<Exclude<Message["kind"], "user">, string> = {
  assistant: "max-w-prose pt-0.5",
  human: "w-fit max-w-prose rounded-r-md border-l-3 border-you bg-you/10 px-4 py-2.5",
};
</script>

<template>
  <section class="mt-8">
    <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <h2 class="text-lg">Conversation</h2>
      <a v-if="loaded && !error" class="text-sm" :href="downloadUrl" download>Download JSON</a>
    </header>
    <p v-if="error && !items.length" class="my-4 text-muted">Couldn't load the conversation: {{ error }}.</p>
    <p v-else-if="loaded && !items.length" class="my-4 text-muted">No messages yet.</p>
    <ol v-else>
      <li
        v-for="(entry, index) in entries"
        :key="index"
        class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start first:mt-0 max-sm:grid-cols-1"
        :class="startsTurn(index) ? 'mt-7' : 'mt-2'"
      >
        <span
          v-if="startsTurn(index)"
          class="col-1 pt-1 text-sm leading-normal font-semibold max-sm:pt-0 max-sm:pb-1"
          :class="WHO[speaker(entry)]"
          >{{ ROLES[speaker(entry)] }}</span
        >
        <template v-if="entry.kind === 'message'">
          <PipelineMessage v-if="entry.message.kind === 'user'" :text="entry.message.text" :class="SAY" />
          <div v-else :class="[SAY, TEXT[entry.message.kind]]">
            <MarkdownText :text="entry.message.text" class="leading-relaxed wrap-anywhere" />
            <span
              v-if="entry.message.kind === 'human' && entry.message.pending"
              class="mt-1 block text-xs text-muted italic"
              >Queued</span
            >
          </div>
        </template>
        <div
          v-else
          :class="[
            SAY,
            '-ml-3.25 overflow-hidden rounded-md border border-transparent has-open:border-line has-open:bg-surface',
          ]"
        >
          <ToolCall v-if="entry.calls.length === 1" :call="entry.calls[0]!" quiet />
          <details v-else class="group/tools">
            <summary
              class="flex min-h-9 cursor-pointer list-none items-center gap-2.5 px-3 text-sm text-muted group-open/tools:text-ink hover:bg-ink/4 hover:text-ink focus-visible:-outline-offset-2 marker:hidden"
            >
              <span
                class="mr-0.5 size-1.5 flex-none -rotate-45 border-r-2 border-b-2 border-current transition-transform duration-150 ease-in-out group-open/tools:rotate-45 motion-reduce:transition-none"
                aria-hidden="true"
              ></span>
              <span class="flex-none font-medium">{{ entry.calls.length }} tools called</span>
              <code class="min-w-0 truncate text-xs text-muted opacity-80">{{ tally(entry.calls) }}</code>
              <span class="ml-auto flex flex-none gap-0.5 max-sm:hidden" aria-hidden="true">
                <span
                  v-for="(call, i) in entry.calls.slice(0, MAX_MARKS)"
                  :key="i"
                  class="h-3 w-0.75 rounded-full"
                  :class="tone(call)"
                ></span>
              </span>
            </summary>
            <ul class="border-t border-line">
              <li v-for="(call, i) in entry.calls" :key="i" class="border-line not-first:border-t">
                <ToolCall :call="call" />
              </li>
            </ul>
          </details>
        </div>
      </li>
    </ol>
  </section>
</template>
