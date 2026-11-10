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
  <div class="md" v-html="html"></div>
</template>

<style scoped>
.md {
  overflow-wrap: anywhere;
}
.md :deep(> :first-child) {
  margin-top: 0;
}
.md :deep(> :last-child) {
  margin-bottom: 0;
}
.md :deep(p),
.md :deep(ul),
.md :deep(ol),
.md :deep(pre),
.md :deep(blockquote),
.md :deep(table) {
  margin: 0.5em 0;
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4),
.md :deep(h5),
.md :deep(h6) {
  margin: 1em 0 0.25em;
  font-size: 1em;
  font-weight: 700;
  line-height: inherit;
}
.md :deep(ul),
.md :deep(ol) {
  padding-left: 1.5em;
}
.md :deep(li > ul),
.md :deep(li > ol) {
  margin: 0;
}
.md :deep(code) {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-size: 0.9em;
  background: color-mix(in srgb, var(--ink) 8%, transparent);
}
.md :deep(pre) {
  padding: 0.625rem 0.875rem;
  overflow-x: auto;
  border-radius: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  line-height: 1.5;
}
.md :deep(pre code) {
  padding: 0;
  background: none;
  font-size: inherit;
}
.md :deep(blockquote) {
  padding-left: 0.875em;
  border-left: 3px solid var(--line);
  color: var(--muted);
}
.md :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}
.md :deep(th),
.md :deep(td) {
  padding: 0.25em 0.625em;
  border: 1px solid var(--line);
}
.md :deep(hr) {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 1em 0;
}
.md :deep(a) {
  color: var(--run);
}
</style>
