<script setup lang="ts">
import { defineChart, waffleY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/vue";
import { computed } from "vue";
import { outcomeColor, outcomeLook, type Metrics } from "../metrics.ts";

const props = defineProps<{ outcomes: Metrics["outcomes"] }>();

const shown = computed(() => props.outcomes.filter((entry) => entry.count > 0));

const definition = computed(() =>
  defineChart({
    marks: [waffleY(shown.value, { y: "count", color: "outcome", key: "outcome", gap: 3, radius: 2 })],
    scales: { x: null, y: null },
    color: { scale: outcomeColor },
    tooltip: {
      use: tooltip,
      format: (point) => `${outcomeLook(point.datum.outcome).label}: ${point.datum.count}`,
    },
  }),
);
</script>

<template>
  <Chart :definition aria-label="Runs by outcome, one square per run" :height="176" />
  <ul class="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
    <li v-for="entry in shown" :key="entry.outcome" class="flex items-center gap-1.5">
      <span class="size-3 rounded-xs" :style="{ background: outcomeLook(entry.outcome).paint }" aria-hidden="true" />
      {{ outcomeLook(entry.outcome).label }}
      <span class="font-medium text-muted tabular-nums">{{ entry.count }}</span>
    </li>
  </ul>
</template>
