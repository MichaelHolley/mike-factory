<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { isFinished, pipelineSteps, stepLook } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase }>();

const running = computed(() => props.phase !== "queued" && !isFinished(props.phase));
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
        class="flex h-6 items-end leading-none whitespace-nowrap"
        :class="{
          'text-base font-semibold': step.state === 'current',
          'text-sm font-medium text-ink max-sm:invisible': step.state === 'passed',
          'text-sm font-medium text-muted max-sm:invisible': step.state === 'pending',
        }"
        >{{ step.name }}</span
      >
      <div class="flex h-12 w-full items-center max-sm:h-9" aria-hidden="true">
        <span class="h-0.5 flex-1 bg-idle" :class="{ invisible: i === 0 }" />
        <span
          class="relative grid shrink-0 place-items-center rounded-full transition-all duration-300 motion-reduce:transition-none"
          :class="{
            'size-12 bg-current ring-4 ring-current/20 max-sm:size-9': step.state === 'current',
            'size-9 border-2 border-current bg-current/10 opacity-80 max-sm:size-7': step.state === 'passed',
            'size-9 border-2 border-current opacity-35 max-sm:size-7': step.state === 'pending',
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
              step.state === 'current' ? 'size-6 text-white max-sm:size-4.5 dark:text-bg' : 'size-4.5 max-sm:size-3.5'
            "
          />
        </span>
        <span class="h-0.5 flex-1 bg-idle" :class="{ invisible: i === steps.length - 1 }" />
      </div>
    </li>
  </ol>
</template>
