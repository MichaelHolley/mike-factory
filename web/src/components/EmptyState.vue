<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ icon: Component }>();
</script>

<template>
  <div class="grid justify-items-center gap-2 px-4 py-8 text-center text-muted">
    <component :is="icon" class="size-6" aria-hidden="true" />
    <p class="max-w-xl"><slot /></p>
  </div>
</template>
