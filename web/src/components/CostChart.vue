<script setup lang="ts">
import { defineChart, dodgeY, dot, ruleX } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/vue";
import { computed } from "vue";
import { useRouter } from "vue-router";
import { formatCost } from "../format.ts";
import { outcomeColor, outcomeLook, paintOf, type RunCost } from "../metrics.ts";

const props = defineProps<{ costs: RunCost[]; medianPerMergedPr: number | null }>();
const router = useRouter();

const definition = computed(() =>
  defineChart({
    marks: [
      ruleX(props.medianPerMergedPr === null ? [] : [props.medianPerMergedPr], {
        stroke: paintOf("text-merged"),
        strokeDasharray: "4 3",
        strokeOpacity: 0.9,
      }),
      dot(props.costs, {
        x: "costUsd",
        color: "outcome",
        key: (run) => `${run.repo}#${run.issue}`,
        r: 5,
        fillOpacity: 0.85,
        layout: dodgeY({ anchor: "middle", padding: 1.5, fit: "compress" }),
      }),
    ],
    scales: {
      x: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { format: formatCost } } },
      y: null,
    },
    color: { scale: outcomeColor },
    tooltip: {
      use: tooltip,
      format: ({ datum }) =>
        [
          `${datum.repo} #${datum.issue}`,
          datum.title,
          `${formatCost(datum.costUsd)}, ${outcomeLook(datum.outcome).label}`,
        ]
          .filter(Boolean)
          .join("\n"),
    },
  }),
);

function open(point: { datum: RunCost } | null) {
  if (point) void router.push(`/runs/${point.datum.repo}/${point.datum.issue}`);
}
</script>

<template>
  <Chart
    :definition
    aria-label="Cost of each run, colored by outcome"
    aria-description="The dashed line marks the median cost of a merged pull request. Select a run to open it."
    :height="220"
    :on-select="open"
  />
</template>
