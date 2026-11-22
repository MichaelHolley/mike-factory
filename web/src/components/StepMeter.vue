<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { pipelineSteps, stepLook } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase }>();

const steps = computed(() => pipelineSteps(props.phase));
const position = computed(() => steps.value.findIndex((step) => step.state === "current") + 1);
</script>

<template>
  <span
    class="flex items-center gap-0.5"
    :class="stepLook[phase].hue"
    role="img"
    :aria-label="`Step ${position} of ${steps.length}`"
  >
    <span
      v-for="step in steps"
      :key="step.name"
      class="h-1.5 w-2.5 rounded-full @max-2xl:w-2"
      :class="{
        'bg-current': step.state === 'current',
        'bg-current/40': step.state === 'passed',
        'bg-idle': step.state === 'pending',
      }"
    />
  </span>
</template>
