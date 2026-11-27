<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useRuns } from "../composables/useRuns.ts";
import { stepLook } from "../phase.ts";

const route = useRoute();
const { live, inReview } = useRuns();

const groups = computed(() =>
  [
    { id: "sidebar-live", label: "Working now", runs: live.value },
    { id: "sidebar-review", label: "In review", runs: inReview.value },
  ].filter((group) => group.runs.length),
);

const runPath = (run: { repo: string; issue: number }) => `/runs/${run.repo}/${run.issue}`;
</script>

<template>
  <div v-if="groups.length" class="-mx-1 mt-auto flex min-h-0 flex-col gap-4 overflow-y-auto px-1 pb-1">
    <section v-for="group in groups" :key="group.id" :aria-labelledby="group.id">
      <h2 :id="group.id" class="flex items-baseline gap-1.5 px-2 pb-1 text-xs font-medium text-muted">
        {{ group.label }} <span class="tabular-nums">{{ group.runs.length }}</span>
      </h2>

      <ul class="flex flex-col gap-0.5">
        <li v-for="run in group.runs" :key="runPath(run)">
          <RouterLink
            :to="runPath(run)"
            :aria-current="route.path === runPath(run) ? 'page' : undefined"
            :title="`${run.title ?? 'Untitled'} · ${run.repo} #${run.issue} · ${run.phase}`"
            class="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-ink no-underline hover:bg-ink/5 aria-[current=page]:bg-ink/7"
          >
            <span class="flex items-center gap-2 text-xs text-muted">
              <span class="min-w-0 flex-1 truncate">
                {{ run.repo }} <span class="tabular-nums">#{{ run.issue }}</span>
              </span>

              <span class="flex flex-none items-center gap-1 font-medium" :class="stepLook[run.phase].hue">
                <component :is="stepLook[run.phase].icon" :stroke-width="2.25" class="size-3.5" aria-hidden="true" />
                {{ run.phase }}
              </span>
            </span>

            <span class="truncate text-sm font-medium">{{ run.title ?? "Untitled" }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
