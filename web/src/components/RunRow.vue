<script setup lang="ts">
import { GitPullRequest } from "@lucide/vue";
import { RouterLink } from "vue-router";
import type { RunStatus } from "../../../src/runStatus.ts";
import { timeAgo } from "../format.ts";
import { stepLook } from "../phase.ts";
import IconButton from "./IconButton.vue";
import PhaseBadge from "./PhaseBadge.vue";

defineProps<{ run: RunStatus; now: number }>();
</script>

<template>
  <li
    class="relative grid grid-cols-[minmax(0,16rem)_minmax(0,1fr)_8rem_6rem] items-center gap-6 py-4 pr-5 pl-6 hover:bg-run/4 not-first:border-t not-first:border-line max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-4 max-md:gap-y-2"
  >
    <span class="absolute inset-y-0 left-0 w-0.75 bg-current" :class="stepLook[run.phase].hue" aria-hidden="true" />
    <RouterLink
      :to="`/runs/${run.repo}/${run.issue}`"
      class="group inline-flex min-w-0 items-baseline gap-2 text-ink no-underline after:absolute after:inset-0 max-md:col-span-full"
    >
      <span class="truncate font-semibold group-hover:underline group-hover:underline-offset-3">{{ run.repo }}</span>
      <span class="font-medium text-muted tabular-nums group-hover:underline group-hover:underline-offset-3"
        >#{{ run.issue }}</span
      >
    </RouterLink>
    <span class="truncate max-md:col-span-full" :title="run.title ?? undefined">{{ run.title }}</span>
    <PhaseBadge :phase="run.phase" />
    <span class="flex items-center justify-end gap-2 text-sm whitespace-nowrap text-muted tabular-nums">
      <IconButton
        v-if="run.prUrl"
        :href="run.prUrl"
        :icon="GitPullRequest"
        label="Open pull request"
        target="_blank"
        rel="noopener"
        class="relative z-1 -my-1"
      />
      {{ timeAgo(run.updatedAt, now) }}
    </span>
  </li>
</template>
