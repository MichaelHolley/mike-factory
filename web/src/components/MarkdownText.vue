<script setup lang="ts">
import MarkdownIt from "markdown-it";
import { computed } from "vue";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options));
md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  tokens[i]!.attrSet("target", "_blank");
  tokens[i]!.attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, i, options, env, self);
};

const props = defineProps<{ text: string }>();
const html = computed(() => md.render(props.text));
</script>

<template>
  <div class="md wrap-anywhere" v-html="html"></div>
</template>

<style scoped>
@reference "../style.css";

.md :deep(> :first-child) {
  margin-top: 0;
}
.md :deep(> :last-child) {
  margin-bottom: 0;
}
.md :deep(:is(p, ul, ol, pre, blockquote, table)) {
  @apply my-[0.5em];
}
.md :deep(:is(h1, h2, h3, h4, h5, h6)) {
  @apply mt-[1em] mb-[0.25em] text-[1em] leading-[inherit] font-bold;
}
.md :deep(:is(ul, ol)) {
  @apply pl-[1.5em];
}
.md :deep(ul) {
  @apply list-disc;
}
.md :deep(ol) {
  @apply list-decimal;
}
.md :deep(:is(li > ul, li > ol)) {
  @apply m-0;
}
.md :deep(li > ul) {
  list-style-type: circle;
}
.md :deep(li li > ul) {
  list-style-type: square;
}
.md :deep(code) {
  @apply rounded-sm bg-ink/8 px-[0.35em] py-[0.1em] text-[0.9em];
}
.md :deep(pre) {
  @apply overflow-x-auto rounded-sm border border-line bg-bg px-3.5 py-2.5 leading-normal;
}
.md :deep(pre code) {
  @apply bg-transparent p-0 text-[length:inherit];
}
.md :deep(blockquote) {
  @apply border-l-3 border-line pl-[0.875em] text-muted;
}
.md :deep(table) {
  @apply block max-w-full overflow-x-auto;
}
.md :deep(:is(th, td)) {
  @apply border border-line px-[0.625em] py-[0.25em];
}
.md :deep(hr) {
  @apply my-[1em] border-0 border-t border-line;
}
.md :deep(img) {
  display: inline;
}
</style>
