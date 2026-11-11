<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import ConversationLog from "../components/ConversationLog.vue";
import MessageComposer from "../components/MessageComposer.vue";
import PhaseTrack from "../components/PhaseTrack.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { formatCost, formatDuration, formatModel, formatTime, timeAgo } from "../format.ts";
import { isFinished } from "../phase.ts";

const route = useRoute();
const { runs, error, loaded } = useRuns();
const now = useNow();

const run = computed(() =>
  runs.value.find((r) => r.repo === route.params.repo && String(r.issue) === route.params.issue),
);
const finished = computed(() => !!run.value && isFinished(run.value.phase));
const duration = computed(() => {
  const { startedAt, updatedAt } = run.value ?? {};
  if (!startedAt) return null;
  const end = finished.value && updatedAt ? Date.parse(updatedAt) : now.value;
  return formatDuration(end - Date.parse(startedAt));
});
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
      <dl>
        <div>
          <dt>Model</dt>
          <dd>{{ formatModel(run) }}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{{ run.attempts }}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>{{ formatCost(run.costUsd) }}</dd>
        </div>
      </dl>
      <dl>
        <template v-if="run.startedAt">
          <div>
            <dt>Started</dt>
            <dd>
              <time :datetime="run.startedAt" :title="new Date(run.startedAt).toLocaleString()">
                {{ formatTime(run.startedAt, now) }}
              </time>
            </dd>
          </div>
          <div v-if="finished && run.updatedAt">
            <dt>Ended</dt>
            <dd>
              <time :datetime="run.updatedAt" :title="new Date(run.updatedAt).toLocaleString()">
                {{ formatTime(run.updatedAt, now) }}
              </time>
            </dd>
          </div>
          <div v-else>
            <dt>Last activity</dt>
            <dd :title="run.updatedAt ? new Date(run.updatedAt).toLocaleString() : undefined">
              {{ timeAgo(run.updatedAt, now) }}
            </dd>
          </div>
          <div>
            <dt>{{ finished ? "Took" : "Running for" }}</dt>
            <dd>{{ duration }}</dd>
          </div>
        </template>
        <div v-else>
          <dt>Started</dt>
          <dd class="muted">Waiting in the queue</dd>
        </div>
      </dl>
      <dl>
        <div>
          <dt>Issue</dt>
          <dd>
            <a :href="run.issueUrl" :title="run.issueUrl" target="_blank" rel="noopener">#{{ run.issue }}</a>
          </dd>
        </div>
        <div>
          <dt>Pull request</dt>
          <dd>
            <a v-if="run.prUrl" :href="run.prUrl" :title="run.prUrl" target="_blank" rel="noopener">
              #{{ run.prUrl.split("/").pop() }}
            </a>
            <span v-else class="muted">Not opened yet</span>
          </dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>
            <code>{{ run.branch }}</code>
          </dd>
        </div>
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 6px;
}
dl {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr);
  align-content: start;
  gap: 0.5rem 1rem;
  margin: 0;
  padding: 1.125rem 1.25rem;
  background: var(--surface);
}
dl > div {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: baseline;
}
dt {
  font-size: 0.875rem;
  color: var(--muted);
}
dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
time {
  white-space: nowrap;
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
@media (max-width: 52rem) {
  .panel {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
