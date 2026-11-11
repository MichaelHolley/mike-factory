<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import ConversationLog from "../components/ConversationLog.vue";
import MessageComposer from "../components/MessageComposer.vue";
import PhaseTrack from "../components/PhaseTrack.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { formatCost, formatDate, formatModel, timeAgo } from "../format.ts";

const route = useRoute();
const { runs, error, loaded } = useRuns();
const now = useNow();

const run = computed(() =>
  runs.value.find((r) => r.repo === route.params.repo && String(r.issue) === route.params.issue),
);
</script>

<template>
  <RouterLink to="/" class="back">All runs</RouterLink>
  <p v-if="error" class="notice">Couldn't load runs: {{ error }}. Reconnecting…</p>
  <template v-if="run">
    <header class="head">
      <h1>
        <span>{{ run.repo }}</span>
        <span class="issue">#{{ run.issue }}</span>
      </h1>
    </header>

    <PhaseTrack :phase="run.phase" large class="track" />

    <div class="panel">
      <dl class="facts">
        <div>
          <dt>Attempts</dt>
          <dd class="figure">{{ run.attempts }}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd class="figure">{{ formatCost(run.costUsd) }}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{{ formatModel(run) }}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd class="timestamp">{{ formatDate(run.startedAt) }}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd class="timestamp">
            {{ formatDate(run.updatedAt) }} <span class="muted">({{ timeAgo(run.updatedAt, now) }})</span>
          </dd>
        </div>
      </dl>
      <dl class="links">
        <dt>Issue</dt>
        <dd>
          <a :href="run.issueUrl" target="_blank" rel="noopener">{{ run.issueUrl }}</a>
        </dd>
        <dt>Pull request</dt>
        <dd>
          <a v-if="run.prUrl" :href="run.prUrl" target="_blank" rel="noopener">{{ run.prUrl }}</a>
          <span v-else class="muted">None</span>
        </dd>
        <dt>Branch</dt>
        <dd>
          <code>{{ run.branch }}</code>
        </dd>
      </dl>
    </div>

    <section v-if="run.lastError" class="error">
      <h2>Last error</h2>
      <pre>{{ run.lastError }}</pre>
    </section>

    <ConversationLog :repo="run.repo" :issue="String(run.issue)" />
    <MessageComposer :repo="run.repo" :issue="String(run.issue)" :phase="run.phase" />
  </template>
  <p v-else-if="loaded && !error" class="muted">
    No run found for {{ route.params.repo }} #{{ route.params.issue }}. It may not have started yet.
  </p>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--muted);
  text-decoration: none;
}
.back::before {
  content: "\2190\00a0";
}
.back:hover {
  color: var(--ink);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
  margin-bottom: 1.75rem;
}
h1 {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.625rem;
  font-size: clamp(2rem, 5vw, 3rem);
  overflow-wrap: anywhere;
}
.issue {
  font-weight: 500;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.track {
  margin-bottom: 2rem;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
}
dl {
  margin: 0;
}
dt {
  font-size: 0.8125rem;
  color: var(--muted);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
  border-radius: 5px 5px 0 0;
  background: var(--line);
}
.facts > div {
  flex: 1 1 auto;
  padding: 1rem 1.25rem;
  background: var(--surface);
}
.timestamp {
  white-space: nowrap;
}
.figure {
  font-family: var(--font-head);
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.links {
  display: grid;
  grid-template-columns: max-content 1fr;
  align-items: baseline;
  gap: 0.625rem 2rem;
  padding: 1.25rem;
}
.links dt {
  font-size: 0.875rem;
}
.error {
  margin-top: 2rem;
}
h2 {
  margin-bottom: 0.75rem;
  font-size: 1.125rem;
}
pre {
  margin: 0;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--bad);
  border-radius: 0 6px 6px 0;
}
@media (max-width: 40rem) {
  .links {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .links dd {
    margin-bottom: 0.75rem;
  }
}
</style>
