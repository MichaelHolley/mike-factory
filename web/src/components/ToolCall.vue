<script setup lang="ts">
import type { TranscriptItem } from "../../../src/runStatus.ts";

defineProps<{ call: Extract<TranscriptItem, { kind: "tool" }> }>();
</script>

<template>
  <details class="call" :class="call.result ? (call.result.isError ? 'failed' : 'done') : 'pending'">
    <summary>
      <span class="mark" aria-hidden="true"></span>
      <code class="name">{{ call.name }}</code>
      <code v-if="call.summary" class="summary">{{ call.summary }}</code>
      <span v-if="call.result?.isError" class="flag">failed</span>
      <span v-else-if="!call.result" class="flag">no result yet</span>
    </summary>
    <div class="body">
      <h3>Input</h3>
      <pre>{{ call.args }}</pre>
      <template v-if="call.result">
        <h3>Output</h3>
        <pre>{{ call.result.text || "(empty)" }}</pre>
      </template>
    </div>
  </details>
</template>

<style scoped>
.call {
  --tone: color-mix(in srgb, var(--muted) 55%, transparent);
}
.failed {
  --tone: var(--bad);
}
.pending {
  --tone: var(--run);
}
summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.5rem;
  padding: 0 1rem;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary:hover {
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}
.mark {
  flex: none;
  width: 3px;
  height: 1rem;
  border-radius: 1px;
  background: var(--tone);
}
.name {
  flex: none;
  font-weight: 500;
}
.summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}
.flag {
  flex: none;
  margin-left: auto;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--tone);
}
.body {
  padding: 0.25rem 1rem 1rem calc(1rem + 3px + 0.75rem);
}
h3 {
  margin: 0.75rem 0 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--muted);
}
pre {
  margin: 0;
  padding: 0.625rem 0.875rem;
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  background: var(--bg);
  border-radius: 4px;
}
</style>
