<script setup lang="ts">
import { boxX, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/vue";
import { computed } from "vue";
import { formatDuration } from "../format.ts";
import { OUTCOMES, outcomeLook, paintOf, type Metrics } from "../metrics.ts";

const props = defineProps<{ runTimes: Metrics["runTimes"] }>();

const MINUTE = 60_000;
const ROW_PX = 44;

const shown = computed(() => OUTCOMES.filter((outcome) => props.runTimes.some((time) => time.outcome === outcome)));

const definition = computed(() => {
  const rows = props.runTimes.map((time) => ({ label: outcomeLook(time.outcome).label, minutes: time.ms / MINUTE }));
  return defineChart({
    marks: shown.value.map((outcome) => {
      const { label, hue } = outcomeLook(outcome);
      return boxX(
        rows.filter((row) => row.label === label),
        { id: outcome, x: "minutes", y: "label", fill: paintOf(hue), fillOpacity: 0.3, stroke: paintOf(hue), r: 2.5 },
      );
    }),
    scales: {
      x: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Minutes" } },
      y: {
        scale: () =>
          scaleBand<string>()
            .domain(shown.value.map((outcome) => outcomeLook(outcome).label))
            .padding(0.35),
        axis: { ticks: { size: 0 } },
      },
    },
    tooltip: {
      use: tooltip,
      format: ({ datum }) =>
        datum.kind === "summary"
          ? `${datum.category}: median ${formatDuration(datum.median * MINUTE)}, half between ${formatDuration(datum.q1 * MINUTE)} and ${formatDuration(datum.q3 * MINUTE)} (${datum.count} runs)`
          : `${datum.category}: ${formatDuration(datum.value * MINUTE)}`,
    },
  });
});
</script>

<template>
  <Chart :definition aria-label="How long finished runs took, by outcome" :height="ROW_PX * shown.length + 56" />
</template>
