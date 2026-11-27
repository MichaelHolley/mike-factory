<script setup lang="ts">
import { Activity, ChartNoAxesCombined, Factory, History } from "@lucide/vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import RunSearch from "./components/RunSearch.vue";
import SidebarRuns from "./components/SidebarRuns.vue";

const route = useRoute();

const NAV = [
  { to: "/", label: "Runs", icon: Activity, matches: (path: string) => path === "/" || path.startsWith("/runs/") },
  { to: "/finished", label: "Finished", icon: History, matches: (path: string) => path === "/finished" },
  { to: "/metrics", label: "Metrics", icon: ChartNoAxesCombined, matches: (path: string) => path === "/metrics" },
];
</script>

<template>
  <div class="md:pl-60">
    <aside
      class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas px-4 md:fixed md:inset-y-0 md:left-0 md:h-auto md:w-60 md:flex-col md:items-stretch md:gap-3 md:border-0 md:p-3"
    >
      <RouterLink
        to="/"
        class="flex flex-none items-center gap-2 rounded-md text-sm font-semibold text-ink no-underline md:h-8 md:px-2 md:hover:bg-ink/5"
      >
        <span class="grid size-5 place-items-center rounded-sm bg-brand text-white" aria-hidden="true">
          <Factory class="size-3.5" :stroke-width="2.25" />
        </span>
        <span class="max-sm:sr-only">mike-factory</span>
      </RouterLink>

      <RunSearch />

      <nav aria-label="Main" class="flex gap-0.5 md:flex-col">
        <RouterLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          :aria-current="item.matches(route.path) ? 'page' : undefined"
          class="group flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted no-underline hover:bg-ink/5 hover:text-ink aria-[current=page]:bg-ink/7 aria-[current=page]:text-ink"
        >
          <component :is="item.icon" class="size-4 flex-none group-aria-[current=page]:text-brand" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <SidebarRuns class="max-md:hidden" />
    </aside>

    <main class="md:flex md:min-h-screen md:flex-col md:py-2 md:pr-2">
      <div class="bg-bg md:flex-1 md:rounded-lg md:border md:border-line md:shadow-xs">
        <div class="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-8 sm:pt-8">
          <RouterView />
        </div>
      </div>
    </main>
  </div>
</template>
