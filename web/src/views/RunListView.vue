<script setup lang="ts">
import { Coffee } from "@lucide/vue";
import { computed, useTemplateRef } from "vue";
import { RouterLink } from "vue-router";
import EmptyState from "../components/EmptyState.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import RunRow from "../components/RunRow.vue";
import { useLazyList } from "../composables/useLazyList.ts";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { hasEnded, isFinished } from "../phase.ts";

const { runs, error, loaded } = useRuns();
const now = useNow();

const time = (iso: string | null) => (iso ? Date.parse(iso) : null);
const runKey = (run: { repo: string; issue: number }) => `${run.repo}#${run.issue}`;

// Oldest start first so live rows keep their place as updates stream in; queued runs go last.
const live = computed(() =>
  runs.value
    .filter((run) => !hasEnded(run.phase))
    .sort((a, b) => (time(a.startedAt) ?? Infinity) - (time(b.startedAt) ?? Infinity)),
);

const inReview = computed(() =>
  runs.value.filter((run) => run.phase === "done").sort((a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0)),
);

const RECENT_MS = 24 * 60 * 60 * 1000;
const recent = computed(() =>
  runs.value
    .filter((run) => isFinished(run.phase) && now.value - (time(run.updatedAt) ?? 0) < RECENT_MS)
    .sort((a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0)),
);
const recentScroller = useTemplateRef("recentScroller");
const { visible: recentVisible, more: moreRecent, sentinel } = useLazyList(recent, recentScroller);

const hasFinished = computed(() => runs.value.some((run) => isFinished(run.phase)));
</script>

<template>
  <h1 class="mb-6 text-4xl">Runs</h1>
  <ErrorBanner v-if="error" class="mb-6" retrying>Couldn't load runs: {{ error }}. Reconnecting…</ErrorBanner>

  <template v-if="loaded">
    <section aria-labelledby="live-heading">
      <h2 id="live-heading" class="mb-3 flex items-baseline gap-2 text-lg">
        Working now <span v-if="live.length" class="font-medium text-muted tabular-nums">{{ live.length }}</span>
      </h2>
      <ul
        v-if="live.length"
        aria-labelledby="live-heading"
        class="@container overflow-hidden rounded-md border border-line bg-surface"
      >
        <RunRow v-for="run in live" :key="runKey(run)" :run :now />
      </ul>
      <EmptyState v-else :icon="Coffee" class="rounded-md border border-line bg-surface">
        Nothing running. Comment <code>/mike</code> on an issue in a configured repo to start a run.
      </EmptyState>
    </section>

    <section v-if="inReview.length" class="mt-10" aria-labelledby="review-heading">
      <h2 id="review-heading" class="mb-3 flex items-baseline gap-2 text-lg">
        Waiting on review <span class="font-medium text-muted tabular-nums">{{ inReview.length }}</span>
      </h2>
      <ul aria-labelledby="review-heading" class="@container overflow-hidden rounded-md border border-line bg-surface">
        <RunRow v-for="run in inReview" :key="runKey(run)" :run :now />
      </ul>
    </section>

    <section v-if="hasFinished" class="mt-10" aria-labelledby="recent-heading">
      <div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="recent-heading" class="mr-auto flex items-baseline gap-2 text-lg">
          Finished in the last 24 hours
          <span v-if="recent.length" class="font-medium text-muted tabular-nums">{{ recent.length }}</span>
        </h2>
        <RouterLink to="/finished" class="text-sm font-medium">See all finished runs</RouterLink>
      </div>
      <div
        v-if="recent.length"
        ref="recentScroller"
        tabindex="0"
        aria-labelledby="recent-heading"
        class="max-h-120 overflow-y-auto overscroll-contain rounded-md border border-line bg-surface"
      >
        <ul class="@container">
          <RunRow v-for="run in recentVisible" :key="runKey(run)" :run :now compact />
        </ul>
        <div v-if="moreRecent" ref="sentinel" class="py-3 text-center text-sm text-muted">Loading older runs…</div>
      </div>
      <p v-else class="rounded-md border border-line bg-surface py-4 pr-5 pl-6 text-sm text-muted">
        No runs finished in the last 24 hours.
      </p>
    </section>
  </template>
</template>
