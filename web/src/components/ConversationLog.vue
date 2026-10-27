<script setup lang="ts">
import { computed } from "vue";
import type { TranscriptItem } from "../../../src/runStatus.ts";
import { useTranscript } from "../composables/useTranscript.ts";
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
  [...calls.reduce((counts, call) => counts.set(call.name, (counts.get(call.name) ?? 0) + 1), new Map<string, number>())]
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(", ");

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
      <li v-for="(entry, index) in entries" :key="index" :class="entry.kind === 'message' ? entry.message.kind : 'tools'">
        <template v-if="entry.kind === 'message'">
          <span class="role">{{ entry.message.kind === "user" ? "Pipeline" : "Agent" }}</span>
          <pre>{{ entry.message.text }}</pre>
        </template>
        <ToolCall v-else-if="entry.calls.length === 1" :call="entry.calls[0]!" />
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
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
ol > li {
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
li.user,
li.assistant {
  padding: 0.75rem 1.25rem;
}
li.assistant {
  border-left: 3px solid var(--run);
}
.role {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--muted);
}
li > pre {
  margin: 0.375rem 0 0;
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.group > summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.75rem;
  padding: 0 1rem;
  cursor: pointer;
  list-style: none;
}
.group > summary::-webkit-details-marker {
  display: none;
}
.group > summary:hover {
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}
.chevron {
  flex: none;
  width: 0.4375rem;
  height: 0.4375rem;
  margin-right: 0.125rem;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  transform: rotate(-45deg);
  transition: transform 0.15s ease;
}
.group[open] > summary .chevron {
  transform: rotate(45deg);
}
.count {
  flex: none;
  font-weight: 600;
}
.names {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}
.marks {
  display: flex;
  flex: none;
  gap: 2px;
  margin-left: auto;
}
.marks > span {
  width: 3px;
  height: 1rem;
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
@media (max-width: 36rem) {
  .marks {
    display: none;
  }
}
</style>
