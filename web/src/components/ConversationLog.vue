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

const tone = (call: Call) => (call.result ? (call.result.isError ? "failed" : "done") : "pending");
</script>

<template>
  <section class="log">
    <header class="log-head">
      <h2>Conversation</h2>
      <a v-if="loaded && !error" :href="downloadUrl" download>Download JSON</a>
    </header>
    <p v-if="error && !items.length" class="muted">Couldn't load the conversation: {{ error }}.</p>
    <p v-else-if="loaded && !items.length" class="muted">No messages yet.</p>
    <ol v-else>
      <li
        v-for="(entry, index) in entries"
        :key="index"
        :class="[speaker(entry), entry.kind, { turn: startsTurn(index) }]"
      >
        <span v-if="startsTurn(index)" class="who">{{ ROLES[speaker(entry)] }}</span>
        <template v-if="entry.kind === 'message'">
          <PipelineMessage v-if="entry.message.kind === 'user'" :text="entry.message.text" class="say" />
          <div v-else class="say text">
            <MarkdownText :text="entry.message.text" class="body" />
            <span v-if="entry.message.kind === 'human' && entry.message.pending" class="queued">Queued</span>
          </div>
        </template>
        <div v-else class="say calls">
          <ToolCall v-if="entry.calls.length === 1" :call="entry.calls[0]!" />
          <details v-else class="group">
            <summary>
              <span class="chevron" aria-hidden="true"></span>
              <span class="count">{{ entry.calls.length }} tools called</span>
              <code class="names">{{ tally(entry.calls) }}</code>
              <span class="marks" aria-hidden="true">
                <span v-for="(call, i) in entry.calls.slice(0, MAX_MARKS)" :key="i" :class="tone(call)"></span>
              </span>
            </summary>
            <ul>
              <li v-for="(call, i) in entry.calls" :key="i">
                <ToolCall :call="call" />
              </li>
            </ul>
          </details>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.log {
  margin-top: 2rem;
}
.log-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}
.log-head a {
  font-size: 0.875rem;
}
h2 {
  font-size: 1.125rem;
}
ol {
  --gutter: 6.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
ol > li {
  display: grid;
  grid-template-columns: var(--gutter) minmax(0, 1fr);
  align-items: start;
  margin-top: 0.5rem;
}
ol > li.turn {
  margin-top: 1.75rem;
}
ol > li:first-child {
  margin-top: 0;
}
.who {
  grid-column: 1;
  padding-top: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.5;
}
.user .who {
  padding-top: 0.875rem;
  color: var(--muted);
}
.human .who {
  padding-top: 0.625rem;
  color: var(--you);
}
.say {
  grid-column: 2;
  min-width: 0;
}
.body {
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.assistant .text {
  max-width: 70ch;
  padding-top: 0.125rem;
}
.human .text {
  max-width: 70ch;
  width: fit-content;
  padding: 0.625rem 1rem;
  background: color-mix(in srgb, var(--you) 10%, var(--surface));
  border-left: 3px solid var(--you);
  border-radius: 0 6px 6px 0;
}
.queued {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  font-style: italic;
  color: var(--muted);
}
.calls {
  /* Outdent by the summary padding so collapsed rows line up with the prose. */
  margin-left: calc(-0.75rem - 1px);
  border: 1px solid transparent;
  border-radius: 6px;
  overflow: hidden;
}
.calls:has(details[open]) {
  background: var(--surface);
  border-color: var(--line);
}
.group > summary {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.25rem;
  padding: 0 0.75rem;
  font-size: 0.875rem;
  color: var(--muted);
  cursor: pointer;
  list-style: none;
}
.calls > .call:not([open]):not(:hover) :deep(.name) {
  color: var(--muted);
}
.group > summary:focus-visible {
  outline-offset: -2px;
}
.group > summary:hover,
.group[open] > summary {
  color: var(--ink);
}
.group > summary::-webkit-details-marker {
  display: none;
}
.group > summary:hover {
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}
.chevron {
  flex: none;
  width: 0.375rem;
  height: 0.375rem;
  margin-right: 0.125rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.15s ease;
}
.group[open] > summary .chevron {
  transform: rotate(45deg);
}
.count {
  flex: none;
  font-weight: 500;
}
.names {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  color: var(--muted);
  opacity: 0.8;
}
.marks {
  display: flex;
  flex: none;
  gap: 2px;
  margin-left: auto;
}
.marks > span {
  width: 3px;
  height: 0.75rem;
  border-radius: 1px;
  background: color-mix(in srgb, var(--muted) 55%, transparent);
}
.marks > .failed {
  background: var(--bad);
}
.marks > .pending {
  background: var(--run);
}
.group > ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}
.group > ul > li + li {
  border-top: 1px solid var(--line);
}
@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
@media (max-width: 40rem) {
  ol > li {
    grid-template-columns: minmax(0, 1fr);
  }
  li.turn > .who {
    padding: 0 0 0.25rem;
  }
  .who,
  .say {
    grid-column: 1;
  }
}
@media (max-width: 36rem) {
  .marks {
    display: none;
  }
}
</style>
