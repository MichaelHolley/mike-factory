<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { isIdle, pipelineSteps, stepLook } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase }>();

const running = computed(() => props.phase !== "queued" && !isIdle(props.phase));
const steps = computed(() => pipelineSteps(props.phase).map((step) => ({ ...step, ...stepLook[step.name] })));
</script>

<template>
  <ol class="m-0 flex list-none p-0" aria-label="Pipeline">
    <li
      v-for="(step, i) in steps"
      :key="step.name"
      class="flex min-w-0 flex-1 flex-col items-center gap-2"
      :class="step.hue"
      :aria-current="step.state === 'current' ? 'step' : undefined"
    >
      <span
        class="flex h-5 items-end leading-none whitespace-nowrap"
        :class="{
          'text-sm font-semibold': step.state === 'current',
          'text-xs font-medium text-muted max-sm:invisible': step.state !== 'current',
        }"
        >{{ step.name }}</span
      >
      <div class="flex h-10 w-full items-center max-sm:h-8" aria-hidden="true">
        <span class="h-0.5 flex-1 bg-idle" :class="{ invisible: i === 0 }" />
        <span
          class="relative grid shrink-0 place-items-center rounded-full transition-all duration-300 motion-reduce:transition-none"
          :class="{
            'size-10 bg-current ring-4 ring-current/15 max-sm:size-8': step.state === 'current',
            'size-7 bg-current/15 max-sm:size-6': step.state === 'passed',
            'size-7 border-2 border-idle text-muted max-sm:size-6': step.state === 'pending',
          }"
        >
          <span
            v-if="running && step.state === 'current'"
            class="absolute inset-0 animate-ping rounded-full bg-current opacity-25 motion-reduce:hidden"
          />
          <component
            :is="step.icon"
            :stroke-width="2.25"
            class="relative"
            :class="
              step.state === 'current' ? 'size-5 text-white max-sm:size-4 dark:text-bg' : 'size-3.5 max-sm:size-3'
            "
          />
        </span>
        <span class="h-0.5 flex-1 bg-idle" :class="{ invisible: i === steps.length - 1 }" />
      </div>
    </li>
  </ol>
</template>
