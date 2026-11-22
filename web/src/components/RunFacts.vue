<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  CalendarClock,
  CircleDollarSign,
  CircleDot,
  Cpu,
  ExternalLink,
  Flag,
  GitBranch,
  RotateCw,
  Timer,
} from "@lucide/vue";
import type { RunStatus } from "../../../src/runStatus.ts";
import { formatCost, formatDuration, formatModel, formatTime, timeAgo } from "../format.ts";
import { isIdle, prLook } from "../phase.ts";
import CopyButton from "./CopyButton.vue";

const props = defineProps<{ run: RunStatus; now: number }>();

const finished = computed(() => isIdle(props.run.phase));
const pr = computed(() => prLook(props.run.prState));
const prNumber = computed(() => props.run.prUrl?.split("/").pop());

const duration = computed(() => {
  const { startedAt, updatedAt } = props.run;
  if (!startedAt) return null;

  const end = finished.value && updatedAt ? Date.parse(updatedAt) : props.now;
  return formatDuration(end - Date.parse(startedAt));
});

const LINK = "group flex min-w-0 items-center gap-3 text-base font-semibold text-ink no-underline";
const NODE = "grid size-7 flex-none place-items-center rounded-full border bg-surface [&_svg]:size-3.5";
const ROW = "flex items-center justify-between gap-4";
const TERM = "flex flex-none items-center gap-1.5 text-muted [&_svg]:size-3.5 [&_svg]:flex-none";
</script>

<template>
  <section
    aria-label="Run details"
    class="grid grid-cols-1 divide-line rounded-lg border border-line bg-surface text-sm max-sm:divide-y sm:max-lg:grid-cols-2 sm:max-lg:divide-x lg:divide-y"
  >
    <div class="px-3.5 pt-3.5 pb-3">
      <ol aria-label="From issue to pull request">
        <li>
          <a :href="run.issueUrl" target="_blank" rel="noopener" :class="LINK">
            <span :class="NODE" class="border-line text-muted"><CircleDot aria-hidden="true" /></span>
            <span class="flex-1 tabular-nums group-hover:underline group-hover:underline-offset-3">
              Issue #{{ run.issue }}
            </span>
            <ExternalLink class="size-3.5 flex-none text-muted" aria-hidden="true" />
          </a>
        </li>

        <li class="relative flex min-w-0 items-center gap-1 py-2 pl-10">
          <span
            class="absolute inset-y-0 left-3.5 w-px"
            :class="run.prUrl ? ['bg-current', pr.hue] : 'bg-line'"
            aria-hidden="true"
          />
          <GitBranch class="size-3.5 flex-none text-muted" aria-hidden="true" />
          <span class="sr-only">Branch</span>
          <code class="min-w-0 truncate text-xs text-muted" :title="run.branch">{{ run.branch }}</code>
          <CopyButton :text="run.branch" label="Copy branch name" class="-my-1" />
        </li>

        <li>
          <a v-if="run.prUrl" :href="run.prUrl" target="_blank" rel="noopener" :class="LINK">
            <span :class="[NODE, pr.hue]" class="border-current"><component :is="pr.icon" aria-hidden="true" /></span>
            <span class="flex-1 tabular-nums group-hover:underline group-hover:underline-offset-3"
              >PR #{{ prNumber }}</span
            >
            <ExternalLink class="size-3.5 flex-none text-muted" aria-hidden="true" />
          </a>
          <span v-else class="flex items-center gap-3 text-muted">
            <span :class="NODE" class="border-dashed border-line"><component :is="pr.icon" aria-hidden="true" /></span>
            {{ finished ? "No PR" : "PR not opened yet" }}
          </span>
        </li>
      </ol>

      <dl class="mt-4 flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <dt class="flex items-center gap-1.5 text-muted">
          <CircleDollarSign class="size-3.5 flex-none" aria-hidden="true" />Cost
        </dt>
        <dd class="text-2xl font-semibold tracking-tight tabular-nums">{{ formatCost(run.costUsd) }}</dd>
      </dl>
    </div>

    <dl class="flex flex-col gap-1.5 px-3.5 py-3">
      <div :class="ROW">
        <dt :class="TERM"><Cpu aria-hidden="true" />Model</dt>
        <dd class="truncate" :title="formatModel(run)">{{ formatModel(run) }}</dd>
      </div>

      <div :class="ROW">
        <dt :class="TERM"><RotateCw aria-hidden="true" />Attempts</dt>
        <dd class="tabular-nums">{{ run.attempts }}</dd>
      </div>

      <template v-if="run.startedAt">
        <div :class="ROW">
          <dt :class="TERM"><CalendarClock aria-hidden="true" />Started</dt>
          <dd>
            <time :datetime="run.startedAt" :title="new Date(run.startedAt).toLocaleString()">
              {{ formatTime(run.startedAt, now) }}
            </time>
          </dd>
        </div>

        <div v-if="finished && run.updatedAt" :class="ROW">
          <dt :class="TERM"><Flag aria-hidden="true" />Ended</dt>
          <dd>
            <time :datetime="run.updatedAt" :title="new Date(run.updatedAt).toLocaleString()">
              {{ formatTime(run.updatedAt, now) }}
            </time>
          </dd>
        </div>
        <div v-else :class="ROW">
          <dt :class="TERM"><Activity aria-hidden="true" />Last active</dt>
          <dd :title="run.updatedAt ? new Date(run.updatedAt).toLocaleString() : undefined">
            {{ timeAgo(run.updatedAt, now) }}
          </dd>
        </div>

        <div :class="ROW">
          <dt :class="TERM"><Timer aria-hidden="true" />{{ finished ? "Took" : "Running for" }}</dt>
          <dd class="tabular-nums">{{ duration }}</dd>
        </div>
      </template>
      <div v-else :class="ROW">
        <dt :class="TERM"><CalendarClock aria-hidden="true" />Started</dt>
        <dd class="text-muted">Waiting in the queue</dd>
      </div>
    </dl>
  </section>
</template>
