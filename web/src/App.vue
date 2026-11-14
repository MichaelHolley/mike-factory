<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
import RunSearch from "./components/RunSearch.vue";
</script>

<template>
  <header class="relative flex h-13 items-center gap-4 bg-chrome px-4 sm:px-8">
    <div class="flex-1">
      <RouterLink to="/" class="text-lg font-semibold whitespace-nowrap text-chrome-ink no-underline">
        mike-factory
      </RouterLink>
    </div>
    <RunSearch />
    <div class="hidden flex-1 sm:block" />
  </header>
  <main class="mx-auto max-w-6xl px-4 sm:px-8 pt-6 sm:pt-10 pb-16">
    <RouterView />
  </main>
</template>
