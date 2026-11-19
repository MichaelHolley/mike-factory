<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { phaseLabel, stepLook } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase }>();
const look = computed(() => stepLook[props.phase]);
</script>

<template>
  <span class="inline-grid justify-items-start overflow-hidden">
    <Transition
      enter-active-class="transition duration-250 ease-out-quint motion-reduce:duration-150"
      leave-active-class="transition duration-250 ease-out-quint motion-reduce:duration-150"
      enter-from-class="translate-y-full opacity-0 motion-reduce:translate-y-0"
      leave-to-class="-translate-y-full opacity-0 motion-reduce:translate-y-0"
    >
      <span
        :key="phase"
        class="col-start-1 row-start-1 inline-flex items-center gap-2 text-sm font-semibold"
        :class="look.hue"
      >
        <span class="grid size-6 shrink-0 place-items-center rounded-full bg-current/15" aria-hidden="true">
          <component :is="look.icon" :stroke-width="2.25" class="size-3.5" />
        </span>
        {{ phaseLabel(phase) }}
      </span>
    </Transition>
  </span>
</template>
