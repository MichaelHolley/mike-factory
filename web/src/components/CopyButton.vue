<script setup lang="ts">
import { Check, Copy } from "@lucide/vue";
import { ref } from "vue";
import IconButton from "./IconButton.vue";

const props = defineProps<{ text: string; label: string }>();

const copied = ref(false);
let reset: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  await navigator.clipboard.writeText(props.text);
  copied.value = true;
  clearTimeout(reset);
  reset = setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <IconButton :icon="copied ? Check : Copy" :label="copied ? 'Copied' : label" @click="copy" />
</template>
