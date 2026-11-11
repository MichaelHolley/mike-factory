<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { phaseTone, pipelineSteps, toneClass } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase; large?: boolean }>();

const tone = computed(() => phaseTone(props.phase));
const steps = computed(() => pipelineSteps(props.phase));
</script>

<template>
  <ol
    class="m-0 flex list-none flex-wrap items-center gap-y-1.5 p-0"
    :class="[toneClass[tone].text, large ? '-ml-2.5 text-base max-sm:-ml-1.75 max-sm:text-sm' : '-ml-1.75 text-sm']"
    aria-label="Pipeline"
  >
    <li
      v-for="step in steps"
      :key="step.name"
      class="flex items-center whitespace-nowrap not-first:flex-auto not-first:before:mx-1 not-first:before:h-0.5 not-first:before:min-w-1.5 not-first:before:flex-auto max-sm:not-first:flex-none max-sm:not-first:before:w-2.5 max-sm:not-first:before:flex-none"
      :class="step.state === 'pending' ? 'not-first:before:bg-idle' : 'not-first:before:bg-current'"
      :aria-current="step.state === 'current' ? 'step' : undefined"
    >
      <span
        class="inline-flex items-center gap-1.5 rounded-xs leading-snug"
        :class="[
          large ? 'px-2.5 py-1 max-sm:px-1.75 max-sm:py-0.5' : 'px-1.75 py-0.5',
          step.state === 'current' && toneClass[tone].bg,
          {
            'font-medium text-muted': step.state === 'pending',
            'font-medium text-ink': step.state === 'passed',
            'font-semibold text-white dark:text-bg': step.state === 'current',
            'before:size-1.5 before:animate-pulse-dot before:rounded-full before:bg-current motion-reduce:before:animate-none':
              tone === 'run' && step.state === 'current',
          },
        ]"
        >{{ step.name }}</span
      >
    </li>
  </ol>
</template>
