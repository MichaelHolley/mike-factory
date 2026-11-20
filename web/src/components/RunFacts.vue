<script setup lang="ts">
import { computed } from "vue";
import { Activity, CalendarClock, CircleDot, Cpu, ExternalLink, Flag, GitBranch, RotateCw, Timer } from "@lucide/vue";
import type { RunStatus } from "../../../src/runStatus.ts";
import { formatCost, formatDuration, formatModel, formatTime, timeAgo } from "../format.ts";
import { isIdle, prLook } from "../phase.ts";
import CopyButton from "./CopyButton.vue";

const props = defineProps<{ run: RunStatus; now: number }>();

const finished = computed(() => isIdle(props.run.phase));
const pr = computed(() => prLook(props.run.prState));
const prNumber = computed(() => props.run.prUrl?.split("/").pop());

const prState = computed(() => {
  if (props.run.prState === "merged") return "Merged";
  if (props.run.prState === "closed") return "Closed";
  return null;
});

const duration = computed(() => {
  const { startedAt, updatedAt } = props.run;
  if (!startedAt) return null;

  const end = finished.value && updatedAt ? Date.parse(updatedAt) : props.now;
  return formatDuration(end - Date.parse(startedAt));
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
</script>

<template>
  <section aria-label="Run details" class="overflow-hidden rounded-md border border-line bg-surface">
    <div class="flex items-center gap-x-8 gap-y-5 px-6 py-5 max-md:flex-col max-md:items-stretch max-md:px-5">
      <div class="flex min-w-0 flex-1 items-center gap-3 max-sm:flex-col max-sm:items-start">
        <a
          :href="run.issueUrl"
          target="_blank"
          rel="noopener"
          class="group flex flex-none items-center gap-2 text-ink no-underline"
        >
          <CircleDot class="size-4.5 flex-none text-setup" aria-hidden="true" />
          <span class="text-lg font-semibold tabular-nums group-hover:underline group-hover:underline-offset-3"
            >Issue #{{ run.issue }}</span
          >
          <ExternalLink class="size-3.5 flex-none text-muted" aria-hidden="true" />
        </a>

        <div
          class="flex min-w-0 flex-1 items-center gap-2 max-sm:ml-2 max-sm:w-full max-sm:border-l-2 max-sm:border-idle max-sm:py-1 max-sm:pl-5"
        >
          <span class="h-0.5 w-4 flex-none bg-idle max-sm:hidden" aria-hidden="true" />
          <div class="flex min-w-0 items-center gap-1.5 rounded-full border border-line py-0.5 pr-1 pl-3 text-muted">
            <GitBranch class="size-3.5 flex-none" aria-hidden="true" />
            <span class="sr-only">Branch</span>
            <code class="truncate text-ink" :title="run.branch">{{ run.branch }}</code>
            <CopyButton :text="run.branch" label="Copy branch name" />
          </div>
          <span
            class="h-0 min-w-4 flex-1 border-t-2 border-idle max-sm:hidden"
            :class="{ 'border-dashed': !run.prUrl }"
            aria-hidden="true"
          />
        </div>

        <a
          v-if="run.prUrl"
          :href="run.prUrl"
          target="_blank"
          rel="noopener"
          class="group flex flex-none items-baseline gap-2 text-ink no-underline"
        >
          <component :is="pr.icon" class="size-4.5 flex-none self-center" :class="pr.hue" aria-hidden="true" />
          <span class="text-lg font-semibold tabular-nums group-hover:underline group-hover:underline-offset-3"
            >PR #{{ prNumber }}</span
          >
          <ExternalLink class="size-3.5 flex-none text-muted" aria-hidden="true" />
          <span v-if="prState" class="text-sm" :class="pr.hue">{{ prState }}</span>
        </a>
        <div v-else class="flex flex-none items-center gap-2 text-muted">
          <component :is="pr.icon" class="size-4.5 flex-none opacity-60" aria-hidden="true" />
          <span>{{ finished ? "No PR" : "PR not opened yet" }}</span>
        </div>
      </div>

      <div
        class="flex-none border-line md:border-l md:pl-8 max-md:flex max-md:items-baseline max-md:justify-between max-md:border-t max-md:pt-4"
      >
        <p class="text-sm text-muted">Cost</p>
        <p class="text-3xl leading-tight font-semibold tabular-nums">{{ formatCost(run.costUsd) }}</p>
      </div>
    </div>

    <ul
      class="m-0 flex list-none flex-wrap gap-x-6 gap-y-1.5 border-t border-line bg-bg/50 px-6 py-2.5 text-sm text-muted max-md:px-5 [&_li]:flex [&_li]:items-center [&_li]:gap-1.5 [&_svg]:size-3.5 [&_svg]:flex-none"
    >
      <li>
        <Cpu aria-hidden="true" />
        <span class="sr-only">Model</span>
        <span class="text-ink">{{ formatModel(run) }}</span>
      </li>
      <li>
        <RotateCw aria-hidden="true" />
        {{ plural(run.attempts, "attempt") }}
      </li>
      <template v-if="run.startedAt">
        <li>
          <CalendarClock aria-hidden="true" />
          Started
          <time :datetime="run.startedAt" :title="new Date(run.startedAt).toLocaleString()">
            {{ formatTime(run.startedAt, now) }}
          </time>
        </li>
        <li v-if="finished && run.updatedAt">
          <Flag aria-hidden="true" />
          Ended
          <time :datetime="run.updatedAt" :title="new Date(run.updatedAt).toLocaleString()">
            {{ formatTime(run.updatedAt, now) }}
          </time>
        </li>
        <li v-else :title="run.updatedAt ? new Date(run.updatedAt).toLocaleString() : undefined">
          <Activity aria-hidden="true" />
          Active {{ timeAgo(run.updatedAt, now) }}
        </li>
        <li>
          <Timer aria-hidden="true" />
          {{ finished ? "Took" : "Running for" }} {{ duration }}
        </li>
      </template>
      <li v-else>
        <CalendarClock aria-hidden="true" />
        Waiting in the queue
      </li>
    </ul>
  </section>
</template>
