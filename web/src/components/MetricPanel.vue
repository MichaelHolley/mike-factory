<script setup lang="ts">
import { useId } from "vue";

defineProps<{ title: string; question: string }>();
const id = useId();
</script>

<template>
  <section :aria-labelledby="id" class="flex min-w-0 flex-col">
    <h2 :id class="text-lg">{{ title }}</h2>
    <p class="mb-3 text-sm text-muted">{{ question }}</p>
    <div class="flex-1 rounded-md border border-line bg-surface p-5"><slot /></div>
  </section>
</template>
