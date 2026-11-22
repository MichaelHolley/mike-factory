<script setup lang="ts">
import { CircleCheck, CircleDollarSign, Coins, FlaskConical, GitMerge, Timer } from "@lucide/vue";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/vue/segmented-control";
import { computed, ref, type Component } from "vue";
import { RouterLink } from "vue-router";
import CostChart from "../components/CostChart.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import MetricPanel from "../components/MetricPanel.vue";
import OutcomeChart from "../components/OutcomeChart.vue";
import RunTimeChart from "../components/RunTimeChart.vue";
import StartsHeatmap from "../components/StartsHeatmap.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { formatCost, formatDuration } from "../format.ts";
import {
  computeMetrics,
  formatShare,
  outcomeLook,
  RANGE_LABELS,
  RANGES,
  summarize,
  type MetricsRange,
} from "../metrics.ts";

const { runs, error, loaded } = useRuns();
const now = useNow();
const range = ref<MetricsRange>("30d");

const metrics = computed(() => computeMetrics(runs.value, range.value, now.value));
const summary = computed(() => summarize(metrics.value, now.value));
const mostExpensive = computed(() => metrics.value.costs.slice(0, 5));

const facts = computed(() => {
  const { prs, mergeRate, cost, firstPassRate, fixAttemptsPerPr, medianRunMs, runs: count } = metrics.value;
  const { p90PerMergedPr } = cost;

  const list: { icon: Component; hue: string; label: string; value: string; note: string }[] = [
    {
      icon: GitMerge,
      hue: "text-merged",
      label: "Merge rate",
      value: formatShare(mergeRate),
      note: `${prs.merged} of ${prs.merged + prs.closed} settled pull requests`,
    },
    {
      icon: CircleDollarSign,
      hue: "text-muted",
      label: "Per merged PR",
      value: cost.medianPerMergedPr === null ? "-" : formatCost(cost.medianPerMergedPr),
      note: p90PerMergedPr === null ? "Median cost" : `Median; 9 in 10 under ${formatCost(p90PerMergedPr)}`,
    },
    {
      icon: Coins,
      hue: "text-muted",
      label: "Spent",
      value: formatCost(cost.total),
      note: `Across ${count} ${count === 1 ? "run" : "runs"}`,
    },
    {
      icon: FlaskConical,
      hue: "text-muted",
      label: "Passed checks first try",
      value: formatShare(firstPassRate),
      note: fixAttemptsPerPr === null ? "Of runs with a PR" : `${fixAttemptsPerPr.toFixed(1)} fixes per PR on average`,
    },
    {
      icon: Timer,
      hue: "text-muted",
      label: "Run time",
      value: medianRunMs === null ? "-" : formatDuration(medianRunMs),
      note: "Median, start to finish",
    },
  ];
  return list;
});
</script>

<template>
  <ErrorBanner v-if="error" class="mb-6" retrying>Couldn't load runs: {{ error }}. Reconnecting…</ErrorBanner>

  <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
    <h1 class="text-2xl">Metrics</h1>
    <SegmentedControl v-model:value="range" aria-label="Time range" class="bg-surface">
      <SegmentedControlIndicator class="bg-bg" />
      <SegmentedControlItem v-for="option in RANGES" :key="option" :value="option">
        {{ RANGE_LABELS[option] }}
      </SegmentedControlItem>
    </SegmentedControl>
  </div>

  <template v-if="loaded">
    <p class="mb-6 max-w-3xl text-lg leading-snug text-balance sm:text-xl">
      <template v-for="(sentence, i) in summary" :key="i">
        <template v-for="(part, j) in sentence" :key="j">
          <strong v-if="part.figure" class="font-semibold tabular-nums">{{ part.text }}</strong>
          <span v-else class="text-muted">{{ part.text }}</span>
        </template>
        {{ " " }}
      </template>
    </p>

    <template v-if="metrics.runs">
      <dl
        class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-5"
      >
        <div
          v-for="fact in facts"
          :key="fact.label"
          class="flex flex-col gap-1 bg-surface px-5 py-4 max-sm:last:col-span-2"
        >
          <dt class="flex items-center gap-1.5 text-sm text-muted">
            <component :is="fact.icon" class="size-3.5 flex-none" :class="fact.hue" aria-hidden="true" />
            {{ fact.label }}
          </dt>
          <dd class="text-2xl font-semibold tabular-nums">{{ fact.value }}</dd>
          <dd class="text-sm text-muted">{{ fact.note }}</dd>
        </div>
      </dl>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <MetricPanel title="Outcomes" question="Where did the runs end up? One square per run.">
          <OutcomeChart :outcomes="metrics.outcomes" />
        </MetricPanel>

        <MetricPanel title="When runs start" question="Which hours you hand work to mike, in your time zone.">
          <StartsHeatmap :starts="metrics.starts" />
        </MetricPanel>

        <MetricPanel
          title="Cost per run"
          question="What runs cost; the dashed line is the median merged PR. Select a dot to open its run."
          class="lg:col-span-2"
        >
          <div class="grid gap-6 lg:grid-cols-3">
            <CostChart
              class="min-w-0 lg:col-span-2"
              :costs="metrics.costs"
              :median-per-merged-pr="metrics.cost.medianPerMergedPr"
            />
            <div class="min-w-0">
              <h3 class="mb-2 text-sm font-semibold text-muted">Most expensive</h3>
              <ol class="text-sm">
                <li
                  v-for="run in mostExpensive"
                  :key="`${run.repo}#${run.issue}`"
                  class="flex items-center gap-2 py-1.5 not-first:border-t not-first:border-line"
                >
                  <component
                    :is="outcomeLook(run.outcome).icon"
                    class="size-4 flex-none"
                    :class="outcomeLook(run.outcome).hue"
                    :aria-label="outcomeLook(run.outcome).label"
                  />
                  <RouterLink
                    :to="`/runs/${run.repo}/${run.issue}`"
                    class="min-w-0 flex-1 truncate text-ink no-underline hover:underline"
                    :title="run.title ?? undefined"
                  >
                    <span class="font-semibold">{{ run.repo }}</span>
                    <span class="ml-1 text-muted tabular-nums">#{{ run.issue }}</span>
                    <span v-if="run.title" class="ml-1.5 text-muted">{{ run.title }}</span>
                  </RouterLink>
                  <span class="font-medium tabular-nums">{{ formatCost(run.costUsd) }}</span>
                </li>
              </ol>
            </div>
          </div>
        </MetricPanel>

        <MetricPanel title="Run time" question="How long runs took from start to finish, by outcome.">
          <RunTimeChart v-if="metrics.runTimes.length" :run-times="metrics.runTimes" />
          <p v-else class="text-sm text-muted">No finished runs yet.</p>
        </MetricPanel>

        <MetricPanel title="Failures" question="Why runs failed, by the first line of their error.">
          <table v-if="metrics.failures.length" class="w-full text-sm">
            <thead class="sr-only">
              <tr>
                <th>Reason</th>
                <th>Runs</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="failure in metrics.failures"
                :key="failure.reason"
                class="not-first:border-t not-first:border-line"
              >
                <td class="py-2 pr-4 font-mono wrap-anywhere">{{ failure.reason }}</td>
                <td class="py-2 text-right font-medium tabular-nums">{{ failure.count }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="flex items-center gap-2 text-sm text-muted">
            <CircleCheck class="size-4 text-ok" aria-hidden="true" />No failed runs in this range.
          </p>
        </MetricPanel>

        <MetricPanel title="By model" question="How each model did on the runs it worked on." class="lg:col-span-2">
          <table class="w-full text-sm">
            <thead class="text-left text-muted">
              <tr class="*:pb-2 *:font-medium">
                <th>Model</th>
                <th class="text-right">Runs</th>
                <th class="text-right">Merged</th>
                <th class="text-right">Median cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="model in metrics.models" :key="model.model" class="border-t border-line *:py-2">
                <td class="font-medium">{{ model.model }}</td>
                <td class="text-right tabular-nums">{{ model.runs }}</td>
                <td class="text-right tabular-nums">{{ model.merged }}</td>
                <td class="text-right tabular-nums">
                  {{ model.medianCostUsd === null ? "-" : formatCost(model.medianCostUsd) }}
                </td>
              </tr>
            </tbody>
          </table>
        </MetricPanel>
      </div>
    </template>
  </template>
</template>
