<script setup lang="ts">
import { useTranscript } from "../composables/useTranscript.ts";

const props = defineProps<{ repo: string; issue: string }>();
const { items, error, loaded } = useTranscript(
  () => props.repo,
  () => props.issue,
);
</script>

<template>
  <section class="log">
    <h2>Conversation</h2>
    <p v-if="error && !items.length" class="muted">Couldn't load the conversation: {{ error }}.</p>
    <p v-else-if="loaded && !items.length" class="muted">No messages yet.</p>
    <ol v-else>
      <li v-for="(item, index) in items" :key="index" :class="item.kind">
        <template v-if="item.kind === 'user' || item.kind === 'assistant'">
          <span class="role">{{ item.kind === "user" ? "Pipeline" : "Agent" }}</span>
          <pre>{{ item.text }}</pre>
        </template>
        <details v-else-if="item.kind === 'tool-call' || item.kind === 'tool-result'">
          <summary>
            <span class="role">{{ item.kind === "tool-call" ? "Tool call" : "Tool result" }}</span>
            <code>{{ item.name }}</code>
            <span v-if="item.kind === 'tool-result' && item.isError" class="failed">error</span>
          </summary>
          <pre>{{ item.kind === "tool-call" ? item.args : item.text }}</pre>
        </details>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.log {
  margin-top: 2rem;
}
h2 {
  margin-bottom: 0.75rem;
  font-size: 1.125rem;
}
ol {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
}
li.user,
li.assistant {
  padding: 0.75rem 1.25rem;
}
li.assistant {
  border-left: 3px solid var(--run);
}
details {
  padding: 0.5rem 1.25rem;
}
summary {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
}
.role {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.failed {
  color: var(--bad);
  font-weight: 600;
}
pre {
  margin: 0.5rem 0 0;
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--font-code);
  font-size: 0.8125rem;
  line-height: 1.6;
}
</style>
