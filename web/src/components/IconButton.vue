<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ icon: Component; label: string; href?: string }>();
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    :href
    :type="href ? undefined : 'button'"
    :aria-label="label"
    :title="label"
    class="inline-grid size-7 flex-none cursor-pointer place-items-center rounded-sm text-muted no-underline hover:bg-ink/6 hover:text-ink"
  >
    <component :is="icon" class="size-4" aria-hidden="true" />
  </component>
</template>
