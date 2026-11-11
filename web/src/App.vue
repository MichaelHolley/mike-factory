<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <header class="flex h-13 items-center bg-chrome px-4 sm:px-8">
    <RouterLink to="/" class="text-lg font-semibold text-chrome-ink no-underline"> mike-factory </RouterLink>
  </header>
  <main class="mx-auto max-w-6xl px-4 sm:px-8 pt-6 sm:pt-10 pb-16">
    <RouterView />
  </main>
</template>
