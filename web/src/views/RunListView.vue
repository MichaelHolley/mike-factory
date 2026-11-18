<script setup lang="ts">
import { Calendar, ChevronLeft, ChevronRight, Coffee, GitMerge, ListFilter, X } from "@lucide/vue";
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
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import FilterSelect, { type FilterOption } from "../components/FilterSelect.vue";
import RunRow from "../components/RunRow.vue";
import { useNow } from "../composables/useNow.ts";
import { useRuns } from "../composables/useRuns.ts";
import { filterFinished, localDate, type Outcome } from "../finished.ts";
import { formatDay } from "../format.ts";
import { isFinished, stepLook } from "../phase.ts";

const { runs, error, loaded } = useRuns();
const now = useNow();

const time = (iso: string | null) => (iso ? Date.parse(iso) : null);
const runKey = (run: { repo: string; issue: number }) => `${run.repo}#${run.issue}`;

// Oldest start first so live rows keep their place as updates stream in; queued runs go last.
const live = computed(() =>
  runs.value
    .filter((run) => !isFinished(run.phase))
    .sort((a, b) => (time(a.startedAt) ?? Infinity) - (time(b.startedAt) ?? Infinity)),
);

const ALL = "all";
const repo = ref<string>(ALL);
const outcome = ref<Outcome | typeof ALL>(ALL);
const started = ref<DatePickerValue>(null);

const repoOptions = computed<FilterOption<string>[]>(() => [
  { value: ALL, label: "All repos" },
  ...[...new Set(runs.value.filter((run) => isFinished(run.phase)).map((run) => run.repo))]
    .sort()
    .map((name) => ({ value: name, label: name })),
]);
const outcomes: FilterOption<Outcome | typeof ALL>[] = [
  { value: ALL, label: "Any outcome", icon: ListFilter, hue: "text-muted" },
  { value: "merged", label: "Merged", icon: GitMerge, hue: "text-merged" },
  { value: "done", label: "Done, not merged", ...stepLook.done },
  { value: "failed", label: "Failed", ...stepLook.failed },
  { value: "aborted", label: "Aborted", ...stepLook.aborted },
];

const hasFinished = computed(() => runs.value.some((run) => isFinished(run.phase)));
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

const PAGE = 30;
const shown = ref(PAGE);
const scroller = useTemplateRef("scroller");
const sentinel = useTemplateRef("sentinel");

const days = computed(() => {
  const groups: { day: string; runs: typeof filtered.value }[] = [];
  for (const run of filtered.value.slice(0, shown.value)) {
    const day = run.updatedAt ? formatDay(run.updatedAt, now.value) : "Unknown";
    const last = groups.at(-1);
    if (last?.day === day) last.runs.push(run);
    else groups.push({ day, runs: [run] });
  }
  return groups;
});

watch([repo, outcome, started], () => {
  shown.value = PAGE;
  scroller.value?.scrollTo({ top: 0 });
});

let observer: IntersectionObserver | undefined;
// Re-observing makes the observer report again, so a page too short to scroll still loads the next one.
watch(
  [sentinel, shown, () => filtered.value.length],
  async () => {
    observer?.disconnect();
    if (!sentinel.value || !scroller.value) return;
    observer ??= new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) shown.value += PAGE;
      },
      { root: scroller.value, rootMargin: "0px 0px 240px 0px" },
    );
    await nextTick();
    if (sentinel.value) observer.observe(sentinel.value);
  },
  { flush: "post" },
);
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <h1 class="mb-6 text-4xl">Runs</h1>
  <ErrorBanner v-if="error" class="mb-6" retrying>Couldn't load runs: {{ error }}. Reconnecting…</ErrorBanner>

  <template v-if="loaded">
    <section aria-labelledby="live-heading">
      <h2 id="live-heading" class="mb-3 flex items-baseline gap-2 text-lg">
        Working now <span v-if="live.length" class="font-medium text-muted tabular-nums">{{ live.length }}</span>
      </h2>
      <ul
        v-if="live.length"
        aria-labelledby="live-heading"
        class="overflow-hidden rounded-md border border-line bg-surface"
      >
        <RunRow v-for="run in live" :key="runKey(run)" :run :now />
      </ul>
      <EmptyState v-else :icon="Coffee" class="rounded-md border border-line bg-surface">
        Nothing running. Comment <code>/mike</code> on an issue in a configured repo to start a run.
      </EmptyState>
    </section>

    <section v-if="hasFinished" class="mt-10" aria-labelledby="finished-heading">
      <div class="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h2 id="finished-heading" class="mr-auto flex items-baseline gap-2 text-lg">
          Finished <span class="font-medium text-muted tabular-nums">{{ filtered.length }}</span>
        </h2>

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

      <div
        v-if="filtered.length"
        ref="scroller"
        tabindex="0"
        aria-labelledby="finished-heading"
        class="max-h-160 overflow-y-auto overscroll-contain rounded-md border border-line bg-surface"
      >
        <section v-for="group in days" :key="group.day" :aria-label="group.day">
          <h3 class="sticky top-0 z-2 bg-surface text-sm font-semibold">
            <span class="block border-b border-line bg-ink/3 py-2 pr-5 pl-6">{{ group.day }}</span>
          </h3>
          <ul class="not-last:border-b not-last:border-line">
            <RunRow v-for="run in group.runs" :key="runKey(run)" :run :now />
          </ul>
        </section>
        <div v-if="shown < filtered.length" ref="sentinel" class="py-4 text-center text-sm text-muted">
          Loading older runs…
        </div>
      </div>
      <div v-else class="rounded-md border border-line bg-surface">
        <EmptyState :icon="ListFilter">No finished runs match these filters.</EmptyState>
        <div class="-mt-4 flex justify-center pb-8">
          <Button class="bg-surface" @click="clearFilters">Clear filters</Button>
        </div>
      </div>
    </section>
  </template>
</template>
