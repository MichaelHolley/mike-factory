<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <header class="top">
    <RouterLink to="/" class="brand"> mike-factory </RouterLink>
  </header>
  <main>
    <RouterView />
  </main>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  height: 3.25rem;
  padding: 0 clamp(1rem, 4vw, 2rem);
  background: var(--chrome);
}
.brand {
  font-family: var(--font-head);
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--chrome-ink);
  text-decoration: none;
}
main {
  max-width: 72rem;
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem) 4rem;
}
</style>
