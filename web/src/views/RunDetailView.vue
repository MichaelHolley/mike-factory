<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import ConversationLog from "../components/ConversationLog.vue";
import MessageComposer from "../components/MessageComposer.vue";
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
    class="mb-5 inline-block text-[0.875rem] font-medium text-muted no-underline before:content-['\2190\00a0'] hover:text-ink"
    >All runs</RouterLink
  >
  <p v-if="error" class="mb-6 border-l-3 border-bad bg-surface px-4 py-3 text-bad">
    Couldn't load runs: {{ error }}. Reconnecting…
  </p>
  <template v-if="run">
    <header class="mb-7 flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <h1 class="flex flex-wrap gap-x-2.5 text-[clamp(2rem,5vw,3rem)] wrap-anywhere">
        <span>{{ run.repo }}</span>
        <span class="font-medium text-muted tabular-nums">#{{ run.issue }}</span>
      </h1>
    </header>

    <PhaseTrack :phase="run.phase" large class="mb-8" />

    <div
      class="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line max-[52rem]:grid-cols-1 [&>dl]:grid [&>dl]:grid-cols-[7rem_minmax(0,1fr)] [&>dl]:content-start [&>dl]:gap-x-4 [&>dl]:gap-y-2 [&>dl]:bg-surface [&>dl]:px-5 [&>dl]:py-4.5 [&_dl>div]:col-span-full [&_dl>div]:grid [&_dl>div]:grid-cols-subgrid [&_dl>div]:items-baseline [&_dt]:text-[0.875rem] [&_dt]:text-muted [&_dd]:tabular-nums [&_dd]:wrap-anywhere"
    >
      <dl>
        <div>
          <dt>Model</dt>
          <dd>{{ formatModel(run) }}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{{ run.attempts }}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>{{ formatCost(run.costUsd) }}</dd>
        </div>
      </dl>
      <dl>
        <template v-if="run.startedAt">
          <div>
            <dt>Started</dt>
            <dd>
              <time
                class="whitespace-nowrap"
                :datetime="run.startedAt"
                :title="new Date(run.startedAt).toLocaleString()"
              >
                {{ formatTime(run.startedAt, now) }}
              </time>
            </dd>
          </div>
          <div v-if="finished && run.updatedAt">
            <dt>Ended</dt>
            <dd>
              <time
                class="whitespace-nowrap"
                :datetime="run.updatedAt"
                :title="new Date(run.updatedAt).toLocaleString()"
              >
                {{ formatTime(run.updatedAt, now) }}
              </time>
            </dd>
          </div>
          <div v-else>
            <dt>Last activity</dt>
            <dd :title="run.updatedAt ? new Date(run.updatedAt).toLocaleString() : undefined">
              {{ timeAgo(run.updatedAt, now) }}
            </dd>
          </div>
          <div>
            <dt>{{ finished ? "Took" : "Running for" }}</dt>
            <dd>{{ duration }}</dd>
          </div>
        </template>
        <div v-else>
          <dt>Started</dt>
          <dd class="text-muted">Waiting in the queue</dd>
        </div>
      </dl>
      <dl>
        <div>
          <dt>Issue</dt>
          <dd>
            <a :href="run.issueUrl" :title="run.issueUrl" target="_blank" rel="noopener">#{{ run.issue }}</a>
          </dd>
        </div>
        <div>
          <dt>Pull request</dt>
          <dd>
            <a v-if="run.prUrl" :href="run.prUrl" :title="run.prUrl" target="_blank" rel="noopener">
              #{{ run.prUrl.split("/").pop() }}
            </a>
            <span v-else class="text-muted">Not opened yet</span>
          </dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>
            <code>{{ run.branch }}</code>
          </dd>
        </div>
      </dl>
    </div>

    <section v-if="run.lastError" class="mt-8">
      <h2 class="mb-3 text-[1.125rem]">Last error</h2>
      <pre
        class="overflow-x-auto rounded-r-md border border-l-3 border-line border-l-bad bg-surface px-5 py-4 leading-[1.6] whitespace-pre-wrap wrap-anywhere"
        >{{ run.lastError }}</pre>
    </section>

    <ConversationLog :repo="run.repo" :issue="String(run.issue)" />
    <MessageComposer :repo="run.repo" :issue="String(run.issue)" :phase="run.phase" />
  </template>
  <p v-else-if="loaded && !error" class="text-muted">
    No run found for {{ route.params.repo }} #{{ route.params.issue }}. It may not have started yet.
  </p>
</template>
