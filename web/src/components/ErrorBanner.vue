<script setup lang="ts">
import { RefreshCw, TriangleAlert } from "@lucide/vue";

defineProps<{ retrying?: boolean }>();
</script>

<template>
  <p class="flex items-start gap-2.5 border-l-3 border-bad bg-surface px-4 py-3 text-bad">
    <TriangleAlert class="mt-1 size-4 flex-none" aria-hidden="true" />
    <span class="min-w-0 wrap-anywhere"><slot /></span>
    <RefreshCw
      v-if="retrying"
      class="mt-1 ml-auto size-4 flex-none animate-spin motion-reduce:animate-none"
      aria-hidden="true"
    />
  </p>
</template>
