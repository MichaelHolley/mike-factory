<script setup lang="ts">
import { Bot, ChevronRight, Download, Hourglass, MessageSquareDashed, User, Workflow } from "@lucide/vue";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/vue/collapsible";
import { type Component, computed } from "vue";
import type { TranscriptItem } from "../../../src/runStatus.ts";
import { useTranscript } from "../composables/useTranscript.ts";
import EmptyState from "./EmptyState.vue";
import ErrorBanner from "./ErrorBanner.vue";
import IconButton from "./IconButton.vue";
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

const ROLES: Record<Message["kind"], { label: string; icon: Component }> = {
  user: { label: "Pipeline", icon: Workflow },
  assistant: { label: "Agent", icon: Bot },
  human: { label: "You", icon: User },
};

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
    <header class="mb-3 flex items-center justify-between gap-4">
      <h2 class="text-lg">Conversation</h2>
      <IconButton
        v-if="loaded && !error"
        :icon="Download"
        label="Download conversation as JSON"
        :href="downloadUrl"
        download
      />
    </header>
    <ErrorBanner v-if="error && !items.length" class="my-4">Couldn't load the conversation: {{ error }}.</ErrorBanner>
    <EmptyState v-else-if="loaded && !items.length" :icon="MessageSquareDashed">No messages yet.</EmptyState>
    <ol v-else>
      <li
        v-for="(entry, index) in entries"
        :key="index"
        class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start first:mt-0 max-sm:grid-cols-1"
        :class="startsTurn(index) ? 'mt-7' : 'mt-2'"
      >
        <span
          v-if="startsTurn(index)"
          class="col-1 flex items-center gap-1.5 pt-1 text-sm leading-normal font-semibold max-sm:pt-0 max-sm:pb-1"
          :class="WHO[speaker(entry)]"
          ><component :is="ROLES[speaker(entry)].icon" class="size-3.5 flex-none" aria-hidden="true" />{{
            ROLES[speaker(entry)].label
          }}</span
        >
        <template v-if="entry.kind === 'message'">
          <PipelineMessage v-if="entry.message.kind === 'user'" :text="entry.message.text" :class="SAY" />
          <div v-else :class="[SAY, TEXT[entry.message.kind]]">
            <MarkdownText :text="entry.message.text" class="leading-relaxed wrap-anywhere" />
            <span
              v-if="entry.message.kind === 'human' && entry.message.pending"
              class="mt-1 flex items-center gap-1 text-xs text-muted italic"
              ><Hourglass class="size-3" aria-hidden="true" />Queued</span
            >
          </div>
        </template>
        <div
          v-else
          :class="[
            SAY,
            '-ml-3.25 overflow-hidden rounded-md border border-transparent has-data-open:border-line has-data-open:bg-surface',
          ]"
        >
          <ToolCall v-if="entry.calls.length === 1" :call="entry.calls[0]!" quiet />
          <Collapsible v-else class="group/tools">
            <CollapsibleTrigger
              class="flex min-h-9 w-full items-center gap-2.5 px-3 text-sm font-normal text-muted group-data-open/tools:text-ink hover:bg-ink/4 hover:text-ink focus-visible:-outline-offset-2"
            >
              <ChevronRight
                class="size-3.5 flex-none transition-transform duration-150 ease-in-out group-data-open/tools:rotate-90 motion-reduce:transition-none"
                aria-hidden="true"
              />
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
            </CollapsibleTrigger>
            <CollapsiblePanel
              class="h-(--collapsible-panel-height) overflow-hidden text-ink transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
            >
              <ul class="border-t border-line">
                <li v-for="(call, i) in entry.calls" :key="i" class="border-line not-first:border-t">
                  <ToolCall :call="call" />
                </li>
              </ul>
            </CollapsiblePanel>
          </Collapsible>
        </div>
      </li>
    </ol>
  </section>
</template>
