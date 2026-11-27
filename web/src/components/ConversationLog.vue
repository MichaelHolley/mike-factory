<script setup lang="ts">
import {
  Ban,
  Bot,
  ChevronRight,
  CircleAlert,
  Download,
  Hourglass,
  LoaderCircle,
  MessageSquareDashed,
  User,
  Workflow,
} from "@lucide/vue";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/vue/collapsible";
import { type Component, computed } from "vue";
import type { TranscriptItem } from "../../../src/runStatus.ts";
import { useTranscript } from "../composables/useTranscript.ts";
import AttachedFiles from "./AttachedFiles.vue";
import EmptyState from "./EmptyState.vue";
import ErrorBanner from "./ErrorBanner.vue";
import IconButton from "./IconButton.vue";
import MarkdownText from "./MarkdownText.vue";
import PipelineMessage from "./PipelineMessage.vue";
import ReviewCard from "./ReviewCard.vue";
import ToolCall from "./ToolCall.vue";

type Status = Extract<TranscriptItem, { kind: "busy" | "failure" }>;
type Message = Exclude<TranscriptItem, { kind: "tool" } | Status>;
type Call = Extract<TranscriptItem, { kind: "tool" }>;
type Entry = { kind: "message"; message: Message } | { kind: "tools"; calls: Call[] };

const MAX_MARKS = 32;

const props = defineProps<{ repo: string; issue: string }>();

const { items, error, loaded, downloadUrl, fileUrl } = useTranscript(
  () => props.repo,
  () => props.issue,
);

const isStatus = (item: TranscriptItem): item is Status => item.kind === "busy" || item.kind === "failure";

const entries = computed(() =>
  items.value.reduce<Entry[]>((entries, item) => {
    const last = entries.at(-1);
    if (isStatus(item)) return entries;

    if (item.kind !== "tool") entries.push({ kind: "message", message: item });
    else if (last?.kind === "tools") last.calls.push(item);
    else entries.push({ kind: "tools", calls: [item] });

    return entries;
  }, []),
);

const busy = computed(() => items.value.find((item) => item.kind === "busy"));
const failure = computed(() => items.value.find((item) => item.kind === "failure"));

const FAILURES: Record<Extract<Status, { kind: "failure" }>["reason"], string> = {
  model_error: "the model's response failed",
  no_model: "no model is available",
  aborted: "it was aborted",
  reset: "its context was reset",
  faulted: "it crashed",
  orphaned: "it could not be resumed",
  interrupted: "the server stopped while the model was answering",
  restart_limit: "it was cut off too often",
  nothing_to_answer: "there was nothing to answer",
  turn_limit: "it reached its turn limit",
};

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
  human: { label: "User", icon: User },
};

const speaker = (entry: Entry) => (entry.kind === "tools" ? "assistant" : entry.message.kind);

const startsTurn = (index: number) =>
  index === 0 || speaker(entries.value[index - 1]!) !== speaker(entries.value[index]!);

const tone = (call: Call) => {
  if (!call.result) return "bg-run";

  return call.result.isError ? "bg-bad" : "bg-muted/55";
};

const SAY = "col-2 min-w-0 max-sm:col-1";
const WHO: Record<Message["kind"], string> = { user: "pt-3.5 text-muted", assistant: "", human: "pt-2.5 text-you" };

const TEXT: Record<Exclude<Message["kind"], "user">, string> = {
  assistant: "max-w-prose pt-0.5",
  human: "w-fit max-w-prose rounded-r-md border-l-3 border-you bg-you/10 px-4 py-2.5",
};
</script>

<template>
  <section>
    <header class="mb-3 flex items-center justify-between gap-4">
      <h2 class="text-base">Conversation</h2>
      <IconButton
        v-if="loaded && !error"
        :icon="Download"
        label="Download conversation as JSON"
        :href="downloadUrl"
        download
      />
    </header>
    <ErrorBanner v-if="error && !items.length" class="my-4">Couldn't load the conversation: {{ error }}.</ErrorBanner>
    <EmptyState v-else-if="loaded && !entries.length && !busy && !failure" :icon="MessageSquareDashed"
      >No messages yet.</EmptyState
    >
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
          <div v-if="entry.message.kind === 'user'" :class="SAY">
            <PipelineMessage :text="entry.message.text" />
            <AttachedFiles v-if="entry.message.files" :files="entry.message.files" :file-url class="mt-2.5" />
          </div>
          <div v-else :class="[SAY, TEXT[entry.message.kind]]">
            <ReviewCard
              v-if="entry.message.kind === 'human' && entry.message.review"
              :review="entry.message.review"
              :class="entry.message.text && 'mb-2'"
            />
            <MarkdownText
              v-if="entry.message.text"
              :text="entry.message.text"
              :aria-busy="entry.message.kind === 'assistant' && entry.message.streaming"
              class="leading-relaxed wrap-anywhere"
            />
            <span
              v-if="entry.message.kind === 'human' && entry.message.pending"
              class="mt-1 flex items-center gap-1 text-xs text-muted italic"
              ><Hourglass class="size-3" aria-hidden="true" />Queued</span
            >
            <span
              v-if="entry.message.kind === 'assistant' && entry.message.interrupted"
              class="mt-1 flex items-center gap-1 text-xs text-muted italic"
              ><Ban class="size-3" aria-hidden="true" />Interrupted</span
            >
            <AttachedFiles
              v-if="entry.message.kind === 'human' && entry.message.files"
              :files="entry.message.files"
              :file-url
              :class="(entry.message.text || entry.message.pending) && 'mt-2.5'"
            />
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
              hidden-until-found
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
    <div v-if="busy || failure" class="mt-4 grid grid-cols-[6.5rem_minmax(0,1fr)] max-sm:grid-cols-1" role="status">
      <p v-if="busy" :class="[SAY, 'flex items-center gap-2 text-sm text-muted']">
        <LoaderCircle class="size-3.5 flex-none animate-spin text-run motion-reduce:animate-none" aria-hidden="true" />
        <span v-if="busy.retry" class="min-w-0 wrap-anywhere">Retrying after an error: {{ busy.retry }}</span>
        <span v-else>Working…</span>
      </p>

      <div v-if="failure" :class="[SAY, 'text-sm', busy && 'mt-2']">
        <p class="flex items-center gap-2">
          <CircleAlert class="size-3.5 flex-none text-bad" aria-hidden="true" />The agent's last run ended without an
          answer: {{ FAILURES[failure.reason] }}.
        </p>

        <p v-if="failure.detail" class="mt-1 pl-5.5 text-muted wrap-anywhere">{{ failure.detail }}</p>
      </div>
    </div>
  </section>
</template>
