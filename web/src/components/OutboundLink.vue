<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import type { Component } from "vue";

defineProps<{ href: string; icon?: Component }>();
</script>

<template>
  <a :href target="_blank" rel="noopener" class="inline-flex items-center gap-1.5">
    <component :is="icon" v-if="icon" class="size-3.5 flex-none" aria-hidden="true" />
    <span><slot /></span>
    <ExternalLink class="size-3 flex-none opacity-70" aria-hidden="true" />
  </a>
</template>
