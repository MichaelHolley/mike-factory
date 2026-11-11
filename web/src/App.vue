<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <header class="flex h-13 items-center bg-chrome px-[clamp(1rem,4vw,2rem)]">
    <RouterLink to="/" class="text-[1.125rem] font-semibold tracking-[0.01em] text-chrome-ink no-underline">
      mike-factory
    </RouterLink>
  </header>
  <main class="mx-auto max-w-6xl px-[clamp(1rem,4vw,2rem)] pt-[clamp(1.5rem,4vw,2.5rem)] pb-16">
    <RouterView />
  </main>
</template>
