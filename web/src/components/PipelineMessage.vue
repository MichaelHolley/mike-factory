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
  <div class="rounded-md border border-line bg-surface">
    <div
      ref="body"
      class="px-5 py-3.5 font-mono text-[0.8125rem] leading-[1.65] wrap-anywhere text-[color-mix(in_srgb,var(--color-ink)_82%,var(--color-muted))]"
      :class="
        expanded
          ? 'max-h-160 overflow-auto'
          : ['max-h-42 overflow-hidden', clipped && '[mask-image:linear-gradient(to_bottom,#000_60%,transparent)]']
      "
    >
      <MarkdownText :text="text" />
    </div>
    <button
      v-if="clipped"
      type="button"
      class="block w-full cursor-pointer rounded-b-md border-t border-line px-5 py-2 text-left text-[0.875rem] font-medium text-muted hover:bg-ink/4 hover:text-ink"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? "Show less" : "Show full prompt" }}
    </button>
  </div>
</template>
