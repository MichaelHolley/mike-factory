<script setup lang="ts">
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, CircleCheck, CircleX, LoaderCircle } from "@lucide/vue";
import { computed } from "vue";
import type { TranscriptItem } from "../../../src/runStatus.ts";
import CopyButton from "./CopyButton.vue";

const props = defineProps<{ call: Extract<TranscriptItem, { kind: "tool" }>; quiet?: boolean }>();

const status = computed(() => {
  const { result } = props.call;
  if (!result) return { icon: LoaderCircle, hue: "text-run animate-spin motion-reduce:animate-none" };
  return result.isError ? { icon: CircleX, hue: "text-bad" } : { icon: CircleCheck, hue: "text-muted/70" };
});

const blocks = computed(() => [
  { label: "Input", icon: ArrowDownToLine, text: props.call.args },
  ...(props.call.result ? [{ label: "Output", icon: ArrowUpFromLine, text: props.call.result.text }] : []),
]);
</script>

<template>
  <details class="group/call">
    <summary
      class="flex min-h-9 cursor-pointer list-none items-center gap-2.5 px-3 text-sm hover:bg-ink/4 focus-visible:-outline-offset-2 marker:hidden"
    >
      <ChevronRight
        class="size-3.5 flex-none text-muted transition-transform duration-150 ease-in-out group-open/call:rotate-90 motion-reduce:transition-none"
        aria-hidden="true"
      />
      <component :is="status.icon" class="size-3.5 flex-none" :class="status.hue" aria-hidden="true" />
      <code
        class="flex-none font-medium"
        :class="quiet && 'text-muted group-open/call:text-ink group-hover/call:text-ink'"
        >{{ call.name }}</code
      >
      <code v-if="call.summary" class="min-w-0 truncate text-muted">{{ call.summary }}</code>
      <span v-if="call.result?.isError" class="ml-auto flex-none text-xs font-semibold text-bad">failed</span>
      <span v-else-if="!call.result" class="ml-auto flex-none text-xs font-semibold text-run">no result yet</span>
    </summary>
    <div class="pt-1 pr-3 pb-3 pl-15">
      <template v-for="block in blocks" :key="block.label">
        <div class="mt-3 mb-1.5 flex items-center justify-between gap-2">
          <h3 class="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <component :is="block.icon" class="size-3.5" aria-hidden="true" />{{ block.label }}
          </h3>
          <CopyButton
            v-if="block.text"
            :text="block.text"
            :label="`Copy ${block.label.toLowerCase()}`"
            class="-my-1.5"
          />
        </div>
        <pre
          class="max-h-96 overflow-auto rounded-sm bg-bg px-3.5 py-2.5 leading-relaxed wrap-anywhere whitespace-pre-wrap"
          >{{ block.text || "(empty)" }}</pre>
      </template>
    </div>
  </details>
</template>
