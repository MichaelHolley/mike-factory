<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ icon: Component; label: string }>();
</script>

<template>
  <div>
    <dt class="flex items-center gap-1.5">
      <component :is="icon" class="size-3.5 flex-none" aria-hidden="true" />
      <!-- Baseline-aligned so the row aligns to the label's baseline, not the icon's bottom edge. -->
      <span class="self-baseline">{{ label }}</span>
    </dt>
    <dd><slot /></dd>
  </div>
</template>
