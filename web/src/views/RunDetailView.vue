<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import PhaseBadge from "../components/PhaseBadge.vue";
import { useRuns } from "../composables/useRuns.ts";
import { formatCost, formatDate, timeAgo } from "../format.ts";

const route = useRoute();
const { runs, error, loaded } = useRuns();

const run = computed(() =>
  runs.value.find((r) => r.repo === route.params.repo && String(r.issue) === route.params.issue),
);
</script>

<template>
  <p><RouterLink to="/">&larr; All runs</RouterLink></p>
  <p v-if="error" class="error">Failed to load status: {{ error }}</p>
  <template v-if="run">
    <h1>
      {{ run.repo }} #{{ run.issue }}
      <PhaseBadge :phase="run.phase" />
    </h1>
    <dl>
      <dt>Attempts</dt>
      <dd>{{ run.attempts }}</dd>
      <dt>Cost</dt>
      <dd>{{ formatCost(run.costUsd) }}</dd>
      <dt>Issue</dt>
      <dd><a :href="run.issueUrl" target="_blank" rel="noopener">{{ run.issueUrl }}</a></dd>
      <dt>Pull request</dt>
      <dd>
        <a v-if="run.prUrl" :href="run.prUrl" target="_blank" rel="noopener">{{ run.prUrl }}</a>
        <span v-else class="muted">-</span>
      </dd>
      <dt>Branch</dt>
      <dd><code>{{ run.branch }}</code></dd>
      <dt>Started</dt>
      <dd>{{ formatDate(run.startedAt) }}</dd>
      <dt>Updated</dt>
      <dd>{{ formatDate(run.updatedAt) }} <span class="muted">({{ timeAgo(run.updatedAt) }})</span></dd>
    </dl>
    <template v-if="run.lastError">
      <h2>Last error</h2>
      <pre>{{ run.lastError }}</pre>
    </template>
  </template>
  <p v-else-if="loaded && !error" class="muted">
    No run for {{ route.params.repo }} #{{ route.params.issue }}.
  </p>
</template>

<style scoped>
h1 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.5rem 1.5rem;
}
dt {
  color: #6b7280;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
pre {
  padding: 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #8881;
  border: 1px solid #8884;
  border-radius: 6px;
  font-size: 0.85rem;
}
.muted {
  color: #6b7280;
}
.error {
  color: #dc2626;
}
@media (max-width: 30rem) {
  dl {
    grid-template-columns: 1fr;
    gap: 0;
  }
  dd {
    margin-bottom: 0.5rem;
  }
}
</style>
