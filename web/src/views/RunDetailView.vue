<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CircleAlert,
  CircleDollarSign,
  CircleDot,
  Cpu,
  Flag,
  GitBranch,
  GitPullRequest,
  RotateCw,
  SearchX,
  Timer,
} from "@lucide/vue";
import { RouterLink, useRoute } from "vue-router";
import ConversationLog from "../components/ConversationLog.vue";
import CopyButton from "../components/CopyButton.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import Fact from "../components/Fact.vue";
import MessageComposer from "../components/MessageComposer.vue";
import OutboundLink from "../components/OutboundLink.vue";
import PhaseTrack from "../components/PhaseTrack.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { formatCost, formatDuration, formatModel, formatTime, timeAgo } from "../format.ts";
import { isFinished } from "../phase.ts";

const route = useRoute();
const { runs, error, loaded } = useRuns();
const now = useNow();

const run = computed(() =>
  runs.value.find((r) => r.repo === route.params.repo && String(r.issue) === route.params.issue),
);
const finished = computed(() => !!run.value && isFinished(run.value.phase));
const duration = computed(() => {
  const { startedAt, updatedAt } = run.value ?? {};
  if (!startedAt) return null;
  const end = finished.value && updatedAt ? Date.parse(updatedAt) : now.value;
  return formatDuration(end - Date.parse(startedAt));
});
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

    <div
      class="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line max-lg:grid-cols-1 *:grid *:grid-cols-[7rem_minmax(0,1fr)] *:content-start *:gap-x-4 *:gap-y-2 *:bg-surface *:px-5 *:py-4.5 [&_dl>div]:col-span-full [&_dl>div]:grid [&_dl>div]:grid-cols-subgrid [&_dl>div]:items-baseline [&_dt]:text-sm [&_dt]:text-muted [&_dd]:tabular-nums [&_dd]:wrap-anywhere"
    >
      <dl>
        <Fact :icon="Cpu" label="Model">{{ formatModel(run) }}</Fact>
        <Fact :icon="RotateCw" label="Attempts">{{ run.attempts }}</Fact>
        <Fact :icon="CircleDollarSign" label="Cost">{{ formatCost(run.costUsd) }}</Fact>
      </dl>
      <dl>
        <template v-if="run.startedAt">
          <Fact :icon="CalendarClock" label="Started">
            <time class="whitespace-nowrap" :datetime="run.startedAt" :title="new Date(run.startedAt).toLocaleString()">
              {{ formatTime(run.startedAt, now) }}
            </time>
          </Fact>
          <Fact v-if="finished && run.updatedAt" :icon="Flag" label="Ended">
            <time class="whitespace-nowrap" :datetime="run.updatedAt" :title="new Date(run.updatedAt).toLocaleString()">
              {{ formatTime(run.updatedAt, now) }}
            </time>
          </Fact>
          <Fact
            v-else
            :icon="Activity"
            label="Last activity"
            :title="run.updatedAt ? new Date(run.updatedAt).toLocaleString() : undefined"
          >
            {{ timeAgo(run.updatedAt, now) }}
          </Fact>
          <Fact :icon="Timer" :label="finished ? 'Took' : 'Running for'">{{ duration }}</Fact>
        </template>
        <Fact v-else :icon="CalendarClock" label="Started" class="text-muted">Waiting in the queue</Fact>
      </dl>
      <dl>
        <Fact :icon="CircleDot" label="Issue">
          <OutboundLink :href="run.issueUrl">#{{ run.issue }}</OutboundLink>
        </Fact>
        <Fact :icon="GitPullRequest" label="Pull request">
          <OutboundLink v-if="run.prUrl" :href="run.prUrl"> #{{ run.prUrl.split("/").pop() }} </OutboundLink>
          <span v-else class="text-muted">Not opened yet</span>
        </Fact>
        <Fact :icon="GitBranch" label="Branch">
          <div class="flex items-center gap-1">
            <code class="min-w-0">{{ run.branch }}</code>
            <CopyButton :text="run.branch" label="Copy branch name" class="-my-1.5" />
          </div>
        </Fact>
      </dl>
    </div>

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

    <ConversationLog :repo="run.repo" :issue="String(run.issue)" />
    <MessageComposer :repo="run.repo" :issue="String(run.issue)" :phase="run.phase" />
  </template>
  <EmptyState v-else-if="loaded && !error" :icon="SearchX">
    No run found for {{ route.params.repo }} #{{ route.params.issue }}. It may not have started yet.
  </EmptyState>
</template>
