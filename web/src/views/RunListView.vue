<script setup lang="ts">
import { ArrowRight, Coffee } from "@lucide/vue";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import EmptyState from "../components/EmptyState.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import RunRow from "../components/RunRow.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { isFinished, isIdle } from "../phase.ts";

const { runs, error, loaded } = useRuns();
const now = useNow();

const time = (iso: string | null) => (iso ? Date.parse(iso) : null);
const runKey = (run: { repo: string; issue: number }) => `${run.repo}#${run.issue}`;

// Oldest start first so live rows keep their place as updates stream in; queued runs go last.
const live = computed(() =>
  runs.value
    .filter((run) => !isIdle(run.phase))
    .sort((a, b) => (time(a.startedAt) ?? Infinity) - (time(b.startedAt) ?? Infinity)),
);

const inReview = computed(() =>
  runs.value
    .filter((run) => run.phase === "review")
    .sort((a, b) => (time(a.updatedAt) ?? 0) - (time(b.updatedAt) ?? 0)),
);

const RECENT_MS = 24 * 60 * 60 * 1000;
const RECENT_SHOWN = 8;
const recent = computed(() =>
  runs.value
    .filter((run) => isFinished(run.phase) && now.value - (time(run.updatedAt) ?? 0) < RECENT_MS)
    .sort((a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0)),
);

const hasFinished = computed(() => runs.value.some((run) => isFinished(run.phase)));

const HEADING = "flex items-baseline gap-2 text-base font-semibold";
const COUNT = "text-sm font-medium text-muted tabular-nums";
const LIST = "@container overflow-hidden rounded-lg border border-line bg-surface";
</script>

<template>
  <h1 class="mb-6 text-2xl">Runs</h1>
  <ErrorBanner v-if="error" class="mb-6" retrying>Couldn't load runs: {{ error }}. Reconnecting…</ErrorBanner>

  <div v-if="loaded" class="flex flex-col gap-10">
    <section aria-labelledby="live-heading">
      <h2 id="live-heading" class="mb-3" :class="HEADING">
        Working now <span v-if="live.length" :class="COUNT">{{ live.length }}</span>
      </h2>
      <ul v-if="live.length" aria-labelledby="live-heading" :class="LIST">
        <RunRow v-for="run in live" :key="runKey(run)" :run :now />
      </ul>
      <EmptyState v-else :icon="Coffee" class="rounded-lg border border-dashed border-line">
        Nothing running. Comment <code>/mike</code> on an issue in a configured repo to start a run.
      </EmptyState>
    </section>

    <section v-if="inReview.length" aria-labelledby="review-heading">
      <h2 id="review-heading" class="mb-3" :class="HEADING">
        In review <span :class="COUNT">{{ inReview.length }}</span>
      </h2>
      <ul aria-labelledby="review-heading" :class="LIST">
        <RunRow v-for="run in inReview" :key="runKey(run)" :run :now compact />
      </ul>
    </section>

    <section v-if="hasFinished" aria-labelledby="recent-heading">
      <div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="recent-heading" class="mr-auto" :class="HEADING">
          Finished in the last 24 hours <span v-if="recent.length" :class="COUNT">{{ recent.length }}</span>
        </h2>
        <RouterLink
          to="/finished"
          class="inline-flex items-center gap-1 text-sm font-medium no-underline hover:underline"
        >
          All finished runs<ArrowRight class="size-3.5" aria-hidden="true" />
        </RouterLink>
      </div>
      <ul v-if="recent.length" aria-labelledby="recent-heading" :class="LIST">
        <RunRow v-for="run in recent.slice(0, RECENT_SHOWN)" :key="runKey(run)" :run :now compact />
      </ul>
      <p v-else class="rounded-lg border border-dashed border-line px-5 py-4 text-sm text-muted">
        No runs finished in the last 24 hours.
      </p>
      <p v-if="recent.length > RECENT_SHOWN" class="mt-2 text-sm text-muted">
        Showing the latest {{ RECENT_SHOWN }} of {{ recent.length }}.
      </p>
    </section>
  </div>
</template>
