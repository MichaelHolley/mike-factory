<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { stepLook } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase }>();
const look = computed(() => stepLook[props.phase]);
</script>

<template>
  <span class="inline-flex items-center gap-2 text-sm font-semibold" :class="look.hue">
    <span class="grid size-6 shrink-0 place-items-center rounded-full bg-current/15" aria-hidden="true">
      <component :is="look.icon" :stroke-width="2.25" class="size-3.5" />
    </span>
    {{ phase }}
  </span>
</template>
