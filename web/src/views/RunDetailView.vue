<script setup lang="ts">
import { computed } from "vue";
import { ArrowLeft, CircleAlert, SearchX } from "@lucide/vue";
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
  <RouterLink
    to="/"
    class="mb-5 inline-flex items-center gap-1 text-sm font-medium text-muted no-underline hover:text-ink"
    ><ArrowLeft class="size-4" aria-hidden="true" />All runs</RouterLink
  >
  <ErrorBanner v-if="error" class="mb-6" retrying>Couldn't load runs: {{ error }}. Reconnecting…</ErrorBanner>
  <template v-if="run">
    <header class="mb-7 flex flex-col gap-1.5">
      <component :is="run.title ? 'p' : 'h1'" class="flex flex-wrap gap-x-1.5 font-semibold wrap-anywhere">
        <span>{{ run.repo }}</span>
        <span class="font-medium text-muted tabular-nums">#{{ run.issue }}</span>
      </component>
      <h1 v-if="run.title" class="text-2xl text-balance wrap-anywhere sm:text-3xl">{{ run.title }}</h1>
    </header>

    <PhaseTrack :phase="run.phase" class="mb-8" />

    <RunFacts :run :now />

    <section v-if="run.lastError" class="mt-8">
      <header class="mb-3 flex items-center justify-between gap-4">
        <h2 class="flex items-center gap-2 text-lg">
          <CircleAlert class="size-4.5 text-bad" aria-hidden="true" />Last error
        </h2>
        <CopyButton :text="run.lastError" label="Copy error" />
      </header>
      <pre
        class="overflow-x-auto rounded-r-md border border-l-3 border-line border-l-bad bg-surface px-5 py-4 leading-relaxed whitespace-pre-wrap wrap-anywhere"
        >{{ run.lastError }}</pre>
    </section>

    <!-- Scope the desktop sticky composer to the conversation, below the run details. -->
    <div class="flow-root">
      <ConversationLog :repo="run.repo" :issue="String(run.issue)" />
      <MessageComposer :repo="run.repo" :issue="String(run.issue)" :phase="run.phase" />
    </div>
  </template>
  <EmptyState v-else-if="loaded && !error" :icon="SearchX">
    No run found for {{ route.params.repo }} #{{ route.params.issue }}. It may not have started yet.
  </EmptyState>
</template>
