<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import MarkdownText from "./MarkdownText.vue";

const props = defineProps<{ text: string }>();

const body = useTemplateRef<HTMLElement>("body");
const expanded = ref(false);
const clipped = ref(false);

const measure = () => {
  const el = body.value;
  if (el && !expanded.value) clipped.value = el.scrollHeight > el.clientHeight + 1;
};

const observer = new ResizeObserver(measure);
onMounted(() => body.value && observer.observe(body.value));
onBeforeUnmount(() => observer.disconnect());
watch(() => props.text, measure, { flush: "post" });
</script>

<template>
  <div class="ticket" :class="{ collapsed: !expanded, clipped }">
    <div ref="body" class="text"><MarkdownText :text="text" /></div>
    <button v-if="clipped" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ expanded ? "Show less" : "Show full prompt" }}
    </button>
  </div>
</template>

<style scoped>
.ticket {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.text {
  padding: 0.875rem 1.25rem;
  font-family: var(--font-code);
  font-size: 0.8125rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, var(--ink) 82%, var(--muted));
}
.collapsed .text {
  max-height: 10.5rem;
  overflow: hidden;
}
.collapsed.clipped .text {
  mask-image: linear-gradient(to bottom, #000 60%, transparent);
}
.ticket:not(.collapsed) .text {
  max-height: 40rem;
  overflow: auto;
}
button {
  display: block;
  width: 100%;
  padding: 0.5rem 1.25rem;
  border: 0;
  border-top: 1px solid var(--line);
  border-radius: 0 0 6px 6px;
  background: none;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
  color: var(--muted);
  cursor: pointer;
}
button:hover {
  color: var(--ink);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}
</style>
