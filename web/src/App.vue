<script setup lang="ts">
import { Activity, ChartNoAxesCombined, Factory, History } from "@lucide/vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import RunSearch from "./components/RunSearch.vue";

const route = useRoute();

const NAV = [
  { to: "/", label: "Runs", icon: Activity, matches: (path: string) => path === "/" || path.startsWith("/runs/") },
  { to: "/finished", label: "Finished", icon: History, matches: (path: string) => path === "/finished" },
  { to: "/metrics", label: "Metrics", icon: ChartNoAxesCombined, matches: (path: string) => path === "/metrics" },
];
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-line bg-surface">
    <div class="relative mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 max-sm:gap-3 sm:px-8">
      <RouterLink to="/" class="flex flex-none items-center gap-2 font-semibold text-ink no-underline">
        <span class="grid size-7 place-items-center rounded-md bg-ink text-surface" aria-hidden="true">
          <Factory class="size-4" :stroke-width="2.25" />
        </span>
        <span class="max-sm:sr-only">mike-factory</span>
      </RouterLink>

      <nav aria-label="Main" class="flex h-full items-stretch gap-1">
        <RouterLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          :aria-current="item.matches(route.path) ? 'page' : undefined"
          class="relative flex items-center gap-1.5 px-2.5 text-sm font-medium text-muted no-underline hover:text-ink aria-[current=page]:text-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-2.5 aria-[current=page]:after:-bottom-px aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-ink"
        >
          <component :is="item.icon" class="size-4 flex-none" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <RunSearch />
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-8 sm:pt-8">
    <RouterView />
  </main>
</template>
