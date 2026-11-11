<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { phaseTone, toneClass } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase }>();
const tone = computed(() => toneClass[phaseTone(props.phase)]);
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-sm font-semibold text-(--tone) before:size-2 before:rounded-full before:bg-current"
    :class="tone"
    >{{ phase }}</span
  >
</template>
