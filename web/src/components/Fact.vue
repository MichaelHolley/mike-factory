<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ icon: Component; label: string }>();
</script>

<template>
  <div>
    <dt><component :is="icon" class="mr-1.5 inline-block size-3.5 align-middle" aria-hidden="true" />{{ label }}</dt>
    <dd><slot /></dd>
  </div>
</template>
