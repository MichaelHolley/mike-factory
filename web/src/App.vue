<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <header class="top">
    <RouterLink to="/" class="brand">mike-factory</RouterLink>
  </header>
  <main>
    <RouterView />
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.5;
}
body {
  margin: 0;
}
a {
  color: #2563eb;
}
</style>

<style scoped>
.top {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #8884;
}
.brand {
  font-weight: 600;
  color: inherit;
  text-decoration: none;
}
main {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1rem;
}
</style>
