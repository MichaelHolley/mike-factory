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
  <div class="head">
    <h1>Runs</h1>
    <span v-if="sorted.length" class="count">{{ sorted.length }}</span>
  </div>
  <p v-if="error" class="notice">Couldn't load runs: {{ error }}. Retrying every 5 seconds.</p>
  <p v-else-if="loaded && !sorted.length" class="empty">
    No runs yet. Comment <code>/mike</code> on an issue in a configured repo to start one.
  </p>
  <div v-if="sorted.length" class="panel">
    <table>
      <thead>
        <tr>
          <th>Run</th>
          <th>Status</th>
          <th class="num">Attempts</th>
          <th class="num">Cost</th>
          <th>Pull request</th>
          <th class="num">Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="run in sorted" :key="`${run.repo}#${run.issue}`">
          <td class="run">
            <RouterLink :to="`/runs/${run.repo}/${run.issue}`">
              <span class="repo">{{ run.repo }}</span>
              <span class="issue">#{{ run.issue }}</span>
            </RouterLink>
          </td>
          <td class="status">
            <PhaseBadge :phase="run.phase" />
          </td>
          <td class="num" data-label="Attempts">{{ run.attempts }}</td>
          <td class="num" data-label="Cost">{{ formatCost(run.costUsd) }}</td>
          <td data-label="Pull request">
            <a v-if="run.prUrl" :href="run.prUrl" target="_blank" rel="noopener">Open PR</a>
            <span v-else class="muted">None</span>
          </td>
          <td class="num muted" data-label="Updated">{{ timeAgo(run.updatedAt) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
h1 {
  font-size: 2.25rem;
}
.count {
  font-family: var(--font-head);
  font-size: 1.5rem;
  font-weight: 500;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.empty {
  max-width: 36rem;
  color: var(--muted);
}
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
}
table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
}
th,
td {
  padding: 0.875rem 1.25rem;
  text-align: left;
  vertical-align: middle;
}
th {
  padding-block: 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}
tbody tr + tr td {
  border-top: 1px solid var(--line);
}
tbody tr:hover {
  background: color-mix(in srgb, var(--run) 4%, transparent);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.run a {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  color: var(--ink);
  text-decoration: none;
}
.repo {
  font-weight: 600;
}
.issue {
  font-family: var(--font-head);
  font-weight: 500;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.run a:hover .repo {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

@media (max-width: 48rem) {
  thead {
    display: none;
  }
  table,
  tbody {
    display: block;
    white-space: normal;
  }
  tbody tr {
    display: grid;
    grid-template-columns: repeat(4, auto);
    justify-content: space-between;
    gap: 0.75rem 1rem;
    padding: 1rem 1.25rem;
  }
  tbody tr + tr {
    border-top: 1px solid var(--line);
  }
  tbody tr + tr td {
    border-top: 0;
  }
  td {
    padding: 0;
  }
  .run,
  .status {
    grid-column: 1 / -1;
    width: auto;
  }
  td[data-label]::before {
    content: attr(data-label);
    display: block;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .num {
    text-align: left;
  }
}
</style>
