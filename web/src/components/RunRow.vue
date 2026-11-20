<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { RunStatus } from "../../../src/runStatus.ts";
import { timeAgo } from "../format.ts";
import { prLook, stepLook } from "../phase.ts";
import IconButton from "./IconButton.vue";
import PhaseBadge from "./PhaseBadge.vue";

defineProps<{ run: RunStatus; now: number; compact?: boolean }>();
</script>

<template>
  <li
    class="relative grid grid-cols-[minmax(0,16rem)_minmax(0,1fr)_8rem_1.75rem_4.5rem] items-center gap-6 pr-5 pl-6 hover:bg-run/4 not-first:border-t not-first:border-line @max-3xl:grid-cols-[minmax(0,1fr)_auto_auto] @max-3xl:gap-x-4 @max-3xl:gap-y-2"
    :class="compact ? 'py-2 text-sm' : 'py-4'"
  >
    <span class="absolute inset-y-0 left-0 w-0.75 bg-current" :class="stepLook[run.phase].hue" aria-hidden="true" />
    <RouterLink
      :to="`/runs/${run.repo}/${run.issue}`"
      class="min-w-0 truncate font-semibold text-ink no-underline after:absolute after:inset-0 hover:underline hover:underline-offset-3 @max-3xl:col-span-full"
    >
      {{ run.repo }} <span class="font-medium text-muted tabular-nums">#{{ run.issue }}</span>
    </RouterLink>
    <span class="truncate @max-3xl:col-span-full" :title="run.title ?? undefined">{{ run.title }}</span>
    <PhaseBadge :phase="run.phase" />
    <IconButton
      v-if="run.prUrl"
      :href="run.prUrl"
      :icon="prLook(run.prState).icon"
      :label="prLook(run.prState).label"
      :tone="prLook(run.prState).tone"
      target="_blank"
      rel="noopener"
      class="relative z-1 -my-1 justify-self-center"
    />
    <span v-else class="justify-self-center text-muted">-</span>
    <span class="text-right text-sm whitespace-nowrap text-muted tabular-nums">{{ timeAgo(run.updatedAt, now) }}</span>
  </li>
</template>
