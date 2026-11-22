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

const LINK = "group flex min-w-0 items-center gap-2 font-medium text-ink no-underline";
const ROW = "flex items-center justify-between gap-4";
const TERM = "flex flex-none items-center gap-1.5 text-muted [&_svg]:size-3.5 [&_svg]:flex-none";
</script>

<template>
  <section
    aria-label="Run details"
    class="grid grid-cols-1 divide-line rounded-lg border border-line bg-surface text-sm max-sm:divide-y sm:max-lg:grid-cols-2 sm:max-lg:divide-x lg:divide-y"
  >
    <ul class="flex flex-col gap-1.5 px-3.5 py-3">
      <li>
        <a :href="run.issueUrl" target="_blank" rel="noopener" :class="LINK">
          <CircleDot class="size-3.5 flex-none text-muted" aria-hidden="true" />
          <span class="tabular-nums group-hover:underline group-hover:underline-offset-3">Issue #{{ run.issue }}</span>
          <ExternalLink class="size-3 flex-none text-muted" aria-hidden="true" />
        </a>
      </li>

      <li class="flex min-w-0 items-center gap-2">
        <GitBranch class="size-3.5 flex-none text-muted" aria-hidden="true" />
        <span class="sr-only">Branch</span>
        <code class="min-w-0 truncate text-xs" :title="run.branch">{{ run.branch }}</code>
        <CopyButton :text="run.branch" label="Copy branch name" class="-my-1" />
      </li>

      <li>
        <a v-if="run.prUrl" :href="run.prUrl" target="_blank" rel="noopener" :class="LINK">
          <component :is="pr.icon" class="size-3.5 flex-none" :class="pr.hue" aria-hidden="true" />
          <span class="tabular-nums group-hover:underline group-hover:underline-offset-3">PR #{{ prNumber }}</span>
          <ExternalLink class="size-3 flex-none text-muted" aria-hidden="true" />
        </a>
        <span v-else class="flex items-center gap-2 text-muted">
          <component :is="pr.icon" class="size-3.5 flex-none opacity-60" aria-hidden="true" />
          {{ finished ? "No PR" : "PR not opened yet" }}
        </span>
      </li>
    </ul>

    <dl class="flex flex-col gap-1.5 px-3.5 py-3">
      <div :class="ROW">
        <dt :class="TERM"><CircleDollarSign aria-hidden="true" />Cost</dt>
        <dd class="font-semibold tabular-nums">{{ formatCost(run.costUsd) }}</dd>
      </div>

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
