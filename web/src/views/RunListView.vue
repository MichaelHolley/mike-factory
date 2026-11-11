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
  <h1 class="mb-6 text-4xl">Runs</h1>
  <p v-if="error" class="mb-6 border-l-3 border-bad bg-surface px-4 py-3 text-bad">
    Couldn't load runs: {{ error }}. Reconnecting…
  </p>

  <section v-if="loaded" aria-labelledby="live-heading">
    <h2 id="live-heading" class="mb-3 flex items-baseline gap-2 text-lg">
      Working now <span v-if="live.length" class="font-medium text-muted tabular-nums">{{ live.length }}</span>
    </h2>
    <p v-if="!live.length" class="max-w-xl text-muted">
      Nothing running. Comment <code>/mike</code> on an issue in a configured repo to start a run.
    </p>
    <ul v-else class="overflow-hidden rounded-md border border-l-3 border-line border-l-run bg-surface">
      <li
        v-for="run in live"
        :key="`${run.repo}#${run.issue}`"
        class="relative grid grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] items-center gap-6 px-5 py-4 hover:bg-run/4 not-first:border-t not-first:border-line max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-4 max-md:gap-y-2"
      >
        <RouterLink
          :to="runPath(run)"
          class="group inline-flex min-w-0 items-baseline gap-2 text-ink no-underline after:absolute after:inset-0 max-md:col-span-full"
        >
          <span class="truncate font-semibold group-hover:underline group-hover:underline-offset-3">{{
            run.repo
          }}</span>
          <span class="font-medium text-muted tabular-nums group-hover:underline group-hover:underline-offset-3"
            >#{{ run.issue }}</span
          >
        </RouterLink>
        <PhaseBadge :phase="run.phase" />
        <span
          class="flex gap-4 text-sm whitespace-nowrap tabular-nums max-md:min-w-0 max-md:flex-wrap max-md:justify-end max-md:gap-y-1"
        >
          <span v-if="run.attempts > 1">Attempt {{ run.attempts }}</span>
          <span class="text-muted">{{ formatModel(run) }}</span>
          <span>{{ formatCost(run.costUsd) }}</span>
          <span class="text-muted">{{ timeAgo(run.updatedAt, now) }}</span>
        </span>
      </li>
    </ul>
  </section>

  <section v-if="projects.length" class="mt-10" aria-labelledby="finished-heading">
    <h2 id="finished-heading" class="mb-3 flex items-baseline gap-2 text-lg">Finished</h2>
    <div class="overflow-hidden rounded-md border border-line bg-surface">
      <table class="w-full whitespace-nowrap max-md:block max-md:whitespace-normal">
        <thead class="max-md:hidden [&_th]:px-5 [&_th]:py-3 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted">
          <tr>
            <th class="text-left">Issue</th>
            <th class="text-left">Outcome</th>
            <th class="text-left">Model</th>
            <th class="text-right tabular-nums">Attempts</th>
            <th class="text-right tabular-nums">Cost</th>
            <th class="text-left">Pull request</th>
            <th class="text-right tabular-nums">Updated</th>
          </tr>
        </thead>
        <tbody
          v-for="project in projects"
          :key="project.repo"
          class="max-md:block max-md:first-of-type:[&_th]:border-t-0"
        >
          <tr class="max-md:block">
            <th
              colspan="7"
              scope="rowgroup"
              class="border-y border-line bg-ink/3 px-5 py-2 text-left text-sm font-semibold max-md:block"
            >
              {{ project.repo }} <span class="font-medium text-muted tabular-nums">{{ project.runs.length }}</span>
            </th>
          </tr>
          <tr
            v-for="run in project.runs"
            :key="run.issue"
            class="relative hover:bg-run/4 not-nth-2:border-t not-nth-2:border-line max-md:grid max-md:grid-cols-4 max-md:gap-x-4 max-md:gap-y-3 max-md:px-5 max-md:py-4 *:px-5 *:py-3 max-md:*:p-0 max-md:[&>td[data-label]]:before:block max-md:[&>td[data-label]]:before:text-xs max-md:[&>td[data-label]]:before:text-muted max-md:[&>td[data-label]]:before:content-[attr(data-label)]"
          >
            <td class="max-md:col-span-full">
              <RouterLink
                :to="runPath(run)"
                class="group text-ink no-underline after:absolute after:inset-0"
                :aria-label="`${run.repo} #${run.issue}`"
              >
                <span class="font-semibold text-ink tabular-nums group-hover:underline group-hover:underline-offset-3"
                  >#{{ run.issue }}</span
                >
              </RouterLink>
            </td>
            <td class="max-md:col-span-full">
              <PhaseBadge :phase="run.phase" />
            </td>
            <td data-label="Model" class="max-md:col-span-full">{{ formatModel(run) }}</td>
            <td class="text-right tabular-nums max-md:text-left" data-label="Attempts">{{ run.attempts }}</td>
            <td class="text-right tabular-nums max-md:text-left" data-label="Cost">
              {{ formatCost(run.costUsd) }}
            </td>
            <td data-label="Pull request">
              <a v-if="run.prUrl" :href="run.prUrl" target="_blank" rel="noopener" class="relative z-1">Open PR</a>
              <span v-else class="text-muted">None</span>
            </td>
            <td class="text-right tabular-nums text-muted max-md:text-left" data-label="Updated">
              {{ timeAgo(run.updatedAt, now) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
