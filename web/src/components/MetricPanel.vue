<script setup lang="ts">
import { useId } from "vue";

defineProps<{ title: string; question: string }>();
const id = useId();
</script>

<template>
  <section :aria-labelledby="id" class="flex min-w-0 flex-col rounded-lg border border-line bg-surface">
    <header class="px-5 pt-4">
      <h2 :id class="text-base">{{ title }}</h2>
      <p class="text-sm text-muted">{{ question }}</p>
    </header>
    <div class="flex-1 p-5"><slot /></div>
  </section>
</template>
