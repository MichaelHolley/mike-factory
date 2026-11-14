<script setup lang="ts">
import { ChevronRight, Coffee, GitPullRequest } from "@lucide/vue";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import type { RunStatus } from "../../../src/runStatus.ts";
import EmptyState from "../components/EmptyState.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import IconButton from "../components/IconButton.vue";
import PhaseBadge from "../components/PhaseBadge.vue";
import RunRow from "../components/RunRow.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { timeAgo } from "../format.ts";
import { isFinished } from "../phase.ts";

const { runs, error, loaded } = useRuns();
const now = useNow();
const expandedRepos = ref(new Set<string>());

function toggleRepo(repo: string) {
  if (expandedRepos.value.has(repo)) expandedRepos.value.delete(repo);
  else expandedRepos.value.add(repo);
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : null);
const runPath = (run: RunStatus) => `/runs/${run.repo}/${run.issue}`;

// Oldest start first so live rows keep their place as updates stream in; queued runs go last.
const live = computed(() =>
  runs.value
    .filter((run) => !isFinished(run.phase))
    .sort((a, b) => (time(a.startedAt) ?? Infinity) - (time(b.startedAt) ?? Infinity)),
);

const RECENT_MS = 24 * 60 * 60 * 1000;
const recent = computed(() =>
  runs.value
    .filter((run) => isFinished(run.phase) && now.value - (time(run.updatedAt) ?? 0) < RECENT_MS)
    .sort((a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0))
    .slice(0, 3),
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
  <ErrorBanner v-if="error" class="mb-6" retrying>Couldn't load runs: {{ error }}. Reconnecting…</ErrorBanner>

  <section v-if="loaded" aria-labelledby="activity-heading">
    <h2 id="activity-heading" class="mb-3 text-lg">Activity</h2>
    <EmptyState v-if="!live.length && !recent.length" :icon="Coffee" class="rounded-md border border-line bg-surface">
      Nothing running. Comment <code>/mike</code> on an issue in a configured repo to start a run.
    </EmptyState>
    <div v-else class="overflow-hidden rounded-md border border-line bg-surface">
      <h3 id="live-heading" class="flex items-baseline gap-2 bg-ink/3 py-2 pr-5 pl-6 text-sm font-semibold">
        Working now <span v-if="live.length" class="font-medium text-muted tabular-nums">{{ live.length }}</span>
      </h3>
      <ul v-if="live.length" aria-labelledby="live-heading" class="border-t border-line">
        <RunRow v-for="run in live" :key="`${run.repo}#${run.issue}`" :run :now />
      </ul>
      <p v-else class="flex items-center gap-2 border-t border-line py-4 pr-5 pl-6 text-sm text-muted">
        <Coffee class="size-4" aria-hidden="true" /> Nothing running.
      </p>
      <template v-if="recent.length">
        <h3 id="recent-heading" class="border-t border-line bg-ink/3 py-2 pr-5 pl-6 text-sm font-semibold">
          Finished in the last 24 hours
        </h3>
        <ul aria-labelledby="recent-heading" class="border-t border-line">
          <RunRow v-for="run in recent" :key="`${run.repo}#${run.issue}`" :run :now />
        </ul>
      </template>
    </div>
  </section>

  <section v-if="projects.length" class="mt-10" aria-labelledby="finished-heading">
    <h2 id="finished-heading" class="mb-3 flex items-baseline gap-2 text-lg">Finished</h2>
    <div class="overflow-hidden rounded-md border border-line bg-surface">
      <table class="w-full whitespace-nowrap max-md:block max-md:whitespace-normal">
        <thead class="max-md:hidden [&_th]:px-5 [&_th]:py-3 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted">
          <tr>
            <th class="text-left">Issue</th>
            <th class="text-left">Title</th>
            <th class="text-left">Outcome</th>
            <th class="text-left">PR</th>
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
              colspan="5"
              scope="rowgroup"
              class="border-y border-line bg-ink/3 text-left text-sm font-semibold max-md:block"
            >
              <button
                type="button"
                :aria-expanded="expandedRepos.has(project.repo)"
                class="flex w-full cursor-pointer items-center gap-2 px-5 py-2 text-left hover:bg-ink/4 focus-visible:-outline-offset-2"
                @click="toggleRepo(project.repo)"
              >
                <ChevronRight
                  class="size-4 flex-none text-muted transition-transform duration-150 ease-in-out motion-reduce:transition-none"
                  :class="{ 'rotate-90': expandedRepos.has(project.repo) }"
                  aria-hidden="true"
                />
                <span class="min-w-0 truncate">{{ project.repo }}</span>
                <span class="font-medium text-muted tabular-nums">{{ project.runs.length }}</span>
              </button>
            </th>
          </tr>
          <template v-if="expandedRepos.has(project.repo)">
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
              <td
                class="w-full max-w-0 truncate max-md:col-span-full max-md:max-w-none"
                :title="run.title ?? undefined"
              >
                {{ run.title }}
              </td>
              <td class="max-md:col-span-full">
                <PhaseBadge :phase="run.phase" />
              </td>
              <td data-label="Pull request">
                <IconButton
                  v-if="run.prUrl"
                  :href="run.prUrl"
                  :icon="GitPullRequest"
                  label="Open pull request"
                  target="_blank"
                  rel="noopener"
                  class="relative z-1 -my-1 -ml-1.5 align-middle"
                />
                <span v-else class="text-muted">-</span>
              </td>
              <td class="text-right tabular-nums text-muted max-md:text-left" data-label="Updated">
                {{ timeAgo(run.updatedAt, now) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
