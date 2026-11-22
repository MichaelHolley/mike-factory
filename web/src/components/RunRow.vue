<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { RunStatus } from "../../../src/runStatus.ts";
import { formatCost, formatDuration, timeAgo } from "../format.ts";
import { prLook } from "../phase.ts";
import IconButton from "./IconButton.vue";
import PhaseBadge from "./PhaseBadge.vue";
import StepMeter from "./StepMeter.vue";

const props = defineProps<{ run: RunStatus; now: number; compact?: boolean }>();

const details = computed(() => {
  const { startedAt, costUsd } = props.run;
  if (!startedAt) return "Waiting in the queue";
  return `Running for ${formatDuration(props.now - Date.parse(startedAt))} · ${formatCost(costUsd)}`;
});
</script>

<template>
  <li
    class="relative flex items-center gap-x-6 gap-y-1.5 px-5 not-first:border-t not-first:border-line hover:bg-ink/3 @max-2xl:flex-wrap @max-2xl:gap-x-4"
    :class="compact ? 'py-2.5 text-sm' : 'py-3.5'"
  >
    <PhaseBadge :phase="run.phase" class="w-32 flex-none @max-2xl:order-1 @max-2xl:w-auto" />

    <RouterLink
      :to="`/runs/${run.repo}/${run.issue}`"
      class="min-w-0 flex-1 text-ink no-underline after:absolute after:inset-0 @max-2xl:basis-full"
    >
      <span v-if="compact" class="block truncate" :title="run.title ?? undefined">
        <span class="font-medium">{{ run.title ?? `${run.repo} #${run.issue}` }}</span>
        <span v-if="run.title" class="ml-2 text-muted">
          {{ run.repo }} <span class="tabular-nums">#{{ run.issue }}</span>
        </span>
      </span>

      <template v-else>
        <span class="block truncate font-medium" :title="run.title ?? undefined">
          {{ run.title ?? `${run.repo} #${run.issue}` }}
        </span>
        <span class="block truncate text-sm text-muted">
          {{ run.repo }} <span class="tabular-nums">#{{ run.issue }}</span> · {{ details }}
        </span>
      </template>
    </RouterLink>

    <StepMeter v-if="!compact" :phase="run.phase" class="flex-none @max-2xl:order-1" />

    <span class="flex flex-none items-center gap-6 @max-2xl:order-1 @max-2xl:ml-auto @max-2xl:gap-3">
      <span class="flex w-7 justify-center @max-2xl:empty:hidden">
        <IconButton
          v-if="run.prUrl"
          :href="run.prUrl"
          :icon="prLook(run.prState).icon"
          :label="prLook(run.prState).label"
          :tone="prLook(run.prState).tone"
          target="_blank"
          rel="noopener"
          class="relative z-1 -my-1"
        />
      </span>

      <span class="w-16 text-right text-sm whitespace-nowrap text-muted tabular-nums @max-2xl:w-auto">
        {{ timeAgo(run.updatedAt, now) }}
      </span>
    </span>
  </li>
</template>
