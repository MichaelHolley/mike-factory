<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import PhaseBadge from "../components/PhaseBadge.vue";
import { useRuns } from "../composables/useRuns.ts";
import { formatCost, timeAgo } from "../format.ts";

const { runs, error, loaded } = useRuns();

const sorted = computed(() =>
  [...runs.value].sort((a, b) => {
    if (!a.updatedAt || !b.updatedAt) return Number(!!b.updatedAt) - Number(!!a.updatedAt);
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  }),
);
</script>

<template>
  <h1>Runs</h1>
  <p v-if="error" class="error">Failed to load status: {{ error }}</p>
  <p v-else-if="loaded && !sorted.length" class="muted">No runs yet.</p>
  <div v-if="sorted.length" class="scroll">
    <table>
      <thead>
        <tr>
          <th>Repo</th>
          <th>Issue</th>
          <th>Phase</th>
          <th>Attempts</th>
          <th>Cost</th>
          <th>PR</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="run in sorted" :key="`${run.repo}#${run.issue}`">
          <td>
            <RouterLink :to="`/runs/${run.repo}/${run.issue}`">{{ run.repo }}</RouterLink>
          </td>
          <td>
            <RouterLink :to="`/runs/${run.repo}/${run.issue}`">#{{ run.issue }}</RouterLink>
          </td>
          <td><PhaseBadge :phase="run.phase" /></td>
          <td>{{ run.attempts }}</td>
          <td>{{ formatCost(run.costUsd) }}</td>
          <td>
            <a v-if="run.prUrl" :href="run.prUrl" target="_blank" rel="noopener">PR</a>
            <span v-else class="muted">-</span>
          </td>
          <td class="muted">{{ timeAgo(run.updatedAt) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
}
th,
td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #8883;
}
th {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.muted {
  color: #6b7280;
}
.error {
  color: #dc2626;
}
</style>
