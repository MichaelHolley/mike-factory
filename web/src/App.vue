<script setup lang="ts">
import { ChartNoAxesCombined } from "@lucide/vue";
import { RouterLink, RouterView } from "vue-router";
import RunSearch from "./components/RunSearch.vue";
</script>

<template>
  <header class="relative flex h-13 items-center gap-4 bg-chrome px-4 sm:px-8">
    <nav aria-label="Main" class="flex flex-1 items-center gap-4">
      <RouterLink to="/" class="text-lg font-semibold whitespace-nowrap text-chrome-ink no-underline">
        mike-factory
      </RouterLink>
      <RouterLink
        to="/metrics"
        class="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium text-chrome-ink/80 no-underline hover:bg-chrome-ink/10 hover:text-chrome-ink"
        exact-active-class="text-chrome-ink"
        aria-label="Metrics"
      >
        <ChartNoAxesCombined class="size-4" aria-hidden="true" />
        <span class="max-sm:hidden">Metrics</span>
      </RouterLink>
    </nav>
    <RunSearch />
    <div class="hidden flex-1 sm:block" />
  </header>
  <main class="mx-auto max-w-6xl px-4 sm:px-8 pt-6 sm:pt-10 pb-16">
    <RouterView />
  </main>
</template>
