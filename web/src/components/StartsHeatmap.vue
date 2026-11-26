<script setup lang="ts">
import { cell, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/vue";
import { computed } from "vue";
import { paintOf, type Metrics } from "../metrics.ts";

const props = defineProps<{ starts: Metrics["starts"] }>();

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));

// Opacity steps instead of a continuous color scale, which would need d3-scale.
const LEVELS = [0.3, 0.55, 0.8, 1];

const slots = WEEKDAYS.flatMap((day) => HOURS.map((hour) => ({ day, hour })));

const definition = computed(() => {
  const rows = props.starts.map((start) => ({ ...start, day: WEEKDAYS[start.weekday]!, hour: HOURS[start.hour]! }));
  const most = Math.max(1, ...rows.map((row) => row.count));
  const levelOf = (count: number) => Math.min(LEVELS.length - 1, Math.floor(((count - 1) / most) * LEVELS.length));

  return defineChart({
    marks: [
      cell(slots, { x: "hour", y: "day", fill: "currentColor", fillOpacity: 0.05, inset: 1.5, radius: 2 }),
      ...LEVELS.map((opacity, level) =>
        cell(
          rows.filter((row) => levelOf(row.count) === level),
          { x: "hour", y: "day", fill: paintOf("text-run"), fillOpacity: opacity, inset: 1.5, radius: 2 },
        ),
      ),
    ],
    scales: {
      x: {
        scale: () => scaleBand<string>().domain(HOURS),
        axis: { ticks: { size: 0, format: (hour: string) => (Number(hour) % 3 === 0 ? `${hour}:00` : "") } },
      },
      y: { scale: () => scaleBand<string>().domain(WEEKDAYS), axis: { ticks: { size: 0 } } },
    },
    tooltip: {
      use: tooltip,
      format: (point) =>
        "count" in point.datum
          ? `${point.datum.day} ${point.datum.hour}:00: ${point.datum.count} started`
          : `${point.datum.day} ${point.datum.hour}:00: none`,
    },
  });
});
</script>

<template>
  <Chart :definition aria-label="Runs started by weekday and hour of day" :height="228" />
</template>
