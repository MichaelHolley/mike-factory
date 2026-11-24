<script setup lang="ts">
import { Calendar, ChevronLeft, ChevronRight, ListFilter, X } from "@lucide/vue";
import { Button } from "@ui-sdk/vue/button";
import {
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  DatePicker,
  DatePickerClear,
  DatePickerContent,
  DatePickerInput,
  DatePickerPreset,
  DatePickerTrigger,
  type DatePickerValue,
} from "@ui-sdk/vue/date-picker";
import { computed, ref, watch } from "vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import FilterSelect, { type FilterOption } from "../components/FilterSelect.vue";
import RunRow from "../components/RunRow.vue";
import { useLazyList } from "../composables/useLazyList.ts";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { filterFinished, localDate } from "../finished.ts";
import { formatDay } from "../format.ts";
import { isFinished, stepLook } from "../phase.ts";

const { runs, error, loaded } = useRuns();
const now = useNow();
const runKey = (run: { repo: string; issue: number }) => `${run.repo}#${run.issue}`;

const ALL = "all";
const repo = ref<string>(ALL);
const outcome = ref<IssuePhase | typeof ALL>(ALL);
const started = ref<DatePickerValue>(null);

const repoOptions = computed<FilterOption<string>[]>(() => [
  { value: ALL, label: "All repos" },
  ...[...new Set(runs.value.filter((run) => isFinished(run.phase)).map((run) => run.repo))]
    .sort()
    .map((name) => ({ value: name, label: name })),
]);

const OUTCOMES: [IssuePhase, string][] = [
  ["merged", "Merged"],
  ["closed", "Closed"],
  ["failed", "Failed"],
  ["aborted", "Aborted"],
];
const outcomes: FilterOption<IssuePhase | typeof ALL>[] = [
  { value: ALL, label: "Any outcome", icon: ListFilter, hue: "text-muted" },
  ...OUTCOMES.map(([value, label]) => ({ value, label, ...stepLook[value] })),
];

const filtered = computed(() =>
  filterFinished(runs.value, {
    repo: repo.value === ALL ? null : repo.value,
    outcome: outcome.value === ALL ? null : outcome.value,
    started: Array.isArray(started.value) ? (started.value as [string, string]) : null,
  }),
);

function clearFilters() {
  repo.value = ALL;
  outcome.value = ALL;
  started.value = null;
}

const daysBefore = (days: number) => localDate(new Date(now.value - days * 86_400_000).toISOString());
const presets = computed(() => {
  const today = daysBefore(0);
  const presets: { label: string; value: [string, string] }[] = [
    { label: "Today", value: [today, today] },
    { label: "Last 7 days", value: [daysBefore(6), today] },
    { label: "Last 30 days", value: [daysBefore(29), today] },
  ];
  return presets;
});

const { visible, more, sentinel, reset } = useLazyList(filtered);

const dayOf = (run: { updatedAt: string | null }) => (run.updatedAt ? formatDay(run.updatedAt, now.value) : "Unknown");

const dayCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const run of filtered.value) counts.set(dayOf(run), (counts.get(dayOf(run)) ?? 0) + 1);
  return counts;
});

const days = computed(() => {
  const groups: { day: string; runs: typeof filtered.value }[] = [];
  for (const run of visible.value) {
    const day = dayOf(run);
    const last = groups.at(-1);
    if (last?.day === day) last.runs.push(run);
    else groups.push({ day, runs: [run] });
  }
  return groups;
});

watch([repo, outcome, started], reset);
</script>

<template>
  <ErrorBanner v-if="error" class="mb-6" retrying>Couldn't load runs: {{ error }}. Reconnecting…</ErrorBanner>
  <template v-if="loaded">
    <div class="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
      <h1 class="mr-auto flex items-baseline gap-2 text-2xl">
        Finished runs <span class="text-base font-medium text-muted tabular-nums">{{ filtered.length }}</span>
      </h1>

      <div class="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:*:flex-1">
        <FilterSelect v-model:value="repo" label="Repository" :options="repoOptions" />
        <FilterSelect v-model:value="outcome" label="Outcome" :options="outcomes" />

        <DatePicker v-model:value="started" mode="range" :today="daysBefore(0)" :max="daysBefore(0)" class="w-auto">
          <div class="flex items-center">
            <DatePickerInput
              aria-label="Started on or after"
              placeholder="Started from"
              class="w-28 flex-none bg-surface"
            />
            <span class="px-1.5 text-muted" aria-hidden="true">–</span>
            <DatePickerInput
              end
              aria-label="Started on or before"
              placeholder="until"
              class="w-28 flex-none bg-surface"
            />
            <!-- Wrapped so ui-sdk doesn't tuck these inside the end input and pad every input for them. -->
            <span class="ml-1 flex items-center gap-1">
              <DatePickerClear aria-label="Clear start dates" class="data-empty:hidden">
                <X aria-hidden="true" />
              </DatePickerClear>
              <DatePickerTrigger aria-label="Choose start dates">
                <Calendar aria-hidden="true" />
              </DatePickerTrigger>
            </span>
          </div>

          <DatePickerContent align="end">
            <div class="flex items-center justify-between">
              <CalendarPrevious><ChevronLeft aria-hidden="true" /></CalendarPrevious>
              <CalendarHeading />
              <CalendarNext><ChevronRight aria-hidden="true" /></CalendarNext>
            </div>

            <CalendarGrid>
              <CalendarWeekdays v-slot="{ index }"><CalendarWeekday :index /></CalendarWeekdays>
              <CalendarWeeks v-slot="{ cell }"><CalendarDay :value="cell.date" /></CalendarWeeks>
            </CalendarGrid>

            <div class="flex gap-1 border-t border-line pt-2">
              <DatePickerPreset v-for="preset in presets" :key="preset.label" :value="preset.value">
                {{ preset.label }}
              </DatePickerPreset>
            </div>
          </DatePickerContent>
        </DatePicker>
      </div>
    </div>

    <div v-if="filtered.length" class="flex flex-col gap-4">
      <section v-for="group in days" :key="group.day" :aria-label="group.day">
        <h2 class="sticky top-14 z-10 flex items-baseline gap-2 bg-bg py-2 text-sm font-semibold">
          {{ group.day }} <span class="font-medium text-muted tabular-nums">{{ dayCounts.get(group.day) }}</span>
        </h2>
        <ul class="@container overflow-hidden rounded-lg border border-line bg-surface">
          <RunRow v-for="run in group.runs" :key="runKey(run)" :run :now compact />
        </ul>
      </section>
      <div v-if="more" ref="sentinel" class="py-4 text-center text-sm text-muted">Loading older runs…</div>
    </div>
    <div v-else class="rounded-lg border border-dashed border-line">
      <EmptyState :icon="ListFilter">No finished runs match these filters.</EmptyState>
      <div class="-mt-4 flex justify-center pb-8">
        <Button class="bg-surface" @click="clearFilters">Clear filters</Button>
      </div>
    </div>
  </template>
</template>
