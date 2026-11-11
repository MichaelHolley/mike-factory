<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { RunStatus } from "../../../src/runStatus.ts";
import PhaseBadge from "../components/PhaseBadge.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { formatCost, formatModel, timeAgo } from "../format.ts";
import { isFinished } from "../phase.ts";

const { runs, error, loaded } = useRuns();
const now = useNow();

const time = (iso: string | null) => (iso ? Date.parse(iso) : null);
const runPath = (run: RunStatus) => `/runs/${run.repo}/${run.issue}`;

// Oldest start first so live rows keep their place as updates stream in; queued runs go last.
const live = computed(() =>
  runs.value
    .filter((run) => !isFinished(run.phase))
    .sort((a, b) => (time(a.startedAt) ?? Infinity) - (time(b.startedAt) ?? Infinity)),
);

const projects = computed(() => {
  const byRepo = new Map<string, RunStatus[]>();
  for (const run of runs.value.filter((run) => isFinished(run.phase))) {
    const list = byRepo.get(run.repo) ?? [];
    list.push(run);
    byRepo.set(run.repo, list);
  }
  const latest = (list: RunStatus[]) => time(list[0]!.updatedAt) ?? 0;
  return [...byRepo]
    .map(([repo, list]) => ({
      repo,
      runs: list.sort((a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0)),
    }))
    .sort((a, b) => latest(b.runs) - latest(a.runs));
});
</script>

<template>
  <h1>Runs</h1>
  <p v-if="error" class="notice">Couldn't load runs: {{ error }}. Reconnecting…</p>

  <section v-if="loaded" class="live" aria-labelledby="live-heading">
    <h2 id="live-heading">
      Working now <span v-if="live.length" class="count">{{ live.length }}</span>
    </h2>
    <p v-if="!live.length" class="empty">
      Nothing running. Comment <code>/mike</code> on an issue in a configured repo to start a run.
    </p>
    <ul v-else class="panel">
      <li v-for="run in live" :key="`${run.repo}#${run.issue}`">
        <RouterLink :to="runPath(run)" class="name row-link">
          <span class="repo">{{ run.repo }}</span>
          <span class="issue">#{{ run.issue }}</span>
        </RouterLink>
        <PhaseBadge :phase="run.phase" />
        <span class="meta">
          <span v-if="run.attempts > 1">Attempt {{ run.attempts }}</span>
          <span class="muted">{{ formatModel(run) }}</span>
          <span>{{ formatCost(run.costUsd) }}</span>
          <span class="muted">{{ timeAgo(run.updatedAt, now) }}</span>
        </span>
      </li>
    </ul>
  </section>

  <section v-if="projects.length" class="finished" aria-labelledby="finished-heading">
    <h2 id="finished-heading">Finished</h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Outcome</th>
            <th>Model</th>
            <th class="num">Attempts</th>
            <th class="num">Cost</th>
            <th>Pull request</th>
            <th class="num">Updated</th>
          </tr>
        </thead>
        <tbody v-for="project in projects" :key="project.repo">
          <tr class="project">
            <th colspan="7" scope="rowgroup">
              {{ project.repo }} <span class="count">{{ project.runs.length }}</span>
            </th>
          </tr>
          <tr v-for="run in project.runs" :key="run.issue">
            <td class="run">
              <RouterLink :to="runPath(run)" class="row-link" :aria-label="`${run.repo} #${run.issue}`">
                <span class="issue">#{{ run.issue }}</span>
              </RouterLink>
            </td>
            <td class="status">
              <PhaseBadge :phase="run.phase" />
            </td>
            <td data-label="Model">{{ formatModel(run) }}</td>
            <td class="num" data-label="Attempts">{{ run.attempts }}</td>
            <td class="num" data-label="Cost">{{ formatCost(run.costUsd) }}</td>
            <td data-label="Pull request">
              <a v-if="run.prUrl" :href="run.prUrl" target="_blank" rel="noopener" class="above">Open PR</a>
              <span v-else class="muted">None</span>
            </td>
            <td class="num muted" data-label="Updated">{{ timeAgo(run.updatedAt, now) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
h1 {
  margin-bottom: 1.5rem;
  font-size: 2.25rem;
}
h2 {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 1.125rem;
}
.count {
  font-weight: 500;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.finished {
  margin-top: 2.5rem;
}
.empty {
  max-width: 36rem;
  margin: 0;
  color: var(--muted);
}
.panel {
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.live ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 3px solid var(--run);
}
.live li,
tbody tr:not(.project) {
  position: relative;
}
.row-link::after {
  content: "";
  position: absolute;
  inset: 0;
}
.above {
  position: relative;
  z-index: 1;
}
.live li:hover,
tbody tr:not(.project):hover {
  background: color-mix(in srgb, var(--run) 4%, transparent);
}
.live li {
  display: grid;
  grid-template-columns: minmax(0, 16rem) minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 1.25rem;
}
.live li + li {
  border-top: 1px solid var(--line);
}
.name {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
  color: var(--ink);
  text-decoration: none;
}
.name:hover .repo,
.name:hover .issue {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.repo {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.issue {
  font-weight: 500;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.meta {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
}
th,
td {
  padding: 0.75rem 1.25rem;
  text-align: left;
  vertical-align: middle;
}
thead th {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--muted);
}
.project th {
  padding-block: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--ink) 3%, transparent);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
tbody tr:not(.project) + tr td {
  border-top: 1px solid var(--line);
}
td.run a {
  color: var(--ink);
  text-decoration: none;
}
td.run .issue {
  color: var(--ink);
  font-weight: 600;
}
td.run a:hover .issue {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 48rem) {
  .live li {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem 1rem;
  }
  .name {
    grid-column: 1 / -1;
  }
  .meta {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.25rem 1rem;
    min-width: 0;
  }
  thead {
    display: none;
  }
  table,
  tbody,
  .project,
  .project th {
    display: block;
    white-space: normal;
  }
  tbody tr:not(.project) {
    display: grid;
    grid-template-columns: repeat(4, auto);
    justify-content: space-between;
    gap: 0.75rem 1rem;
    padding: 1rem 1.25rem;
  }
  tbody tr:not(.project) + tr {
    border-top: 1px solid var(--line);
  }
  tbody tr:not(.project) + tr td {
    border-top: 0;
  }
  tbody:first-of-type .project th {
    border-top: 0;
  }
  td {
    padding: 0;
  }
  td.run,
  .status,
  td[data-label="Model"] {
    grid-column: 1 / -1;
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
