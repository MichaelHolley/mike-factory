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
    :class="[
      toneClass[tone],
      large
        ? '-ml-2.5 text-[0.9375rem] max-[36rem]:-ml-1.75 max-[36rem]:text-[0.8125rem]'
        : '-ml-1.75 text-[0.8125rem]',
    ]"
    aria-label="Pipeline"
  >
    <li
      v-for="step in steps"
      :key="step.name"
      class="flex items-center whitespace-nowrap not-first:flex-auto not-first:before:mx-1 not-first:before:h-0.5 not-first:before:min-w-1.5 not-first:before:flex-auto max-[36rem]:not-first:flex-none max-[36rem]:not-first:before:w-2.5 max-[36rem]:not-first:before:flex-none"
      :class="step.state === 'pending' ? 'not-first:before:bg-idle' : 'not-first:before:bg-(--tone)'"
      :aria-current="step.state === 'current' ? 'step' : undefined"
    >
      <span
        class="inline-flex items-center gap-1.5 rounded-xs leading-snug"
        :class="[
          large ? 'px-2.5 py-1 max-[36rem]:px-1.75 max-[36rem]:py-0.5' : 'px-1.75 py-0.5',
          {
            'font-medium text-muted': step.state === 'pending',
            'font-medium text-ink': step.state === 'passed',
            'bg-(--tone) font-semibold text-white dark:text-bg': step.state === 'current',
            'before:size-1.5 before:animate-pulse-dot before:rounded-full before:bg-current motion-reduce:before:animate-none':
              tone === 'run' && step.state === 'current',
          },
        ]"
        >{{ step.name }}</span
      >
    </li>
  </ol>
</template>
