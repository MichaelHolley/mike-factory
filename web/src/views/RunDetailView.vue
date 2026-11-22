<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight, CircleAlert, SearchX } from "@lucide/vue";
import { RouterLink, useRoute } from "vue-router";
import ConversationLog from "../components/ConversationLog.vue";
import CopyButton from "../components/CopyButton.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import MessageComposer from "../components/MessageComposer.vue";
import PhaseTrack from "../components/PhaseTrack.vue";
import RunFacts from "../components/RunFacts.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";

const route = useRoute();
const { runs, error, loaded } = useRuns();
const now = useNow();

const run = computed(() =>
  runs.value.find((r) => r.repo === route.params.repo && String(r.issue) === route.params.issue),
);
</script>

<template>
  <nav aria-label="Breadcrumb" class="mb-2 text-sm text-muted">
    <ol class="flex flex-wrap items-center gap-1">
      <li><RouterLink to="/" class="text-muted no-underline hover:text-ink hover:underline">Runs</RouterLink></li>
      <li class="flex items-center gap-1 wrap-anywhere" aria-current="page">
        <ChevronRight class="size-3.5 flex-none" aria-hidden="true" />
        <span class="font-medium text-ink">{{ route.params.repo }}</span>
        <span class="tabular-nums">#{{ route.params.issue }}</span>
      </li>
    </ol>
  </nav>

  <ErrorBanner v-if="error" class="mb-6" retrying>Couldn't load runs: {{ error }}. Reconnecting…</ErrorBanner>

  <template v-if="run">
    <h1 class="mb-6 text-2xl text-balance wrap-anywhere">{{ run.title ?? `${run.repo} #${run.issue}` }}</h1>

    <PhaseTrack :phase="run.phase" class="mb-8" />

    <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <aside class="lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:self-start">
        <RunFacts :run :now />
      </aside>

      <div class="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">
        <section v-if="run.lastError">
          <header class="mb-3 flex items-center justify-between gap-4">
            <h2 class="flex items-center gap-2 text-base">
              <CircleAlert class="size-4.5 text-bad" aria-hidden="true" />Last error
            </h2>
            <CopyButton :text="run.lastError" label="Copy error" />
          </header>
          <pre
            class="overflow-x-auto rounded-r-lg border border-l-3 border-line border-l-bad bg-surface px-5 py-4 leading-relaxed whitespace-pre-wrap wrap-anywhere"
            >{{ run.lastError }}</pre>
        </section>

        <!-- Scope the desktop sticky composer to the conversation, below the run details. -->
        <div class="flow-root">
          <ConversationLog :repo="run.repo" :issue="String(run.issue)" />
          <MessageComposer :repo="run.repo" :issue="String(run.issue)" :phase="run.phase" />
        </div>
      </div>
    </div>
  </template>
  <EmptyState v-else-if="loaded && !error" :icon="SearchX">
    No run found for {{ route.params.repo }} #{{ route.params.issue }}. It may not have started yet.
  </EmptyState>
</template>
