<script setup lang="ts">
import type { TranscriptItem } from "../../../src/runStatus.ts";

defineProps<{ call: Extract<TranscriptItem, { kind: "tool" }>; quiet?: boolean }>();
</script>

<template>
  <details class="group/call">
    <summary
      class="flex min-h-9 cursor-pointer list-none items-center gap-2.5 px-3 text-sm hover:bg-ink/4 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden"
    >
      <span
        class="h-3 w-0.75 flex-none rounded-[1px]"
        :class="call.result ? (call.result.isError ? 'bg-bad' : 'bg-muted/55') : 'bg-run'"
        aria-hidden="true"
      ></span>
      <code class="flex-none font-medium" :class="quiet && 'group-[:not([open]):not(:hover)]/call:text-muted'">{{
        call.name
      }}</code>
      <code v-if="call.summary" class="min-w-0 truncate text-muted">{{ call.summary }}</code>
      <span v-if="call.result?.isError" class="ml-auto flex-none text-[0.8125rem] font-semibold text-bad">failed</span>
      <span v-else-if="!call.result" class="ml-auto flex-none text-[0.8125rem] font-semibold text-run"
        >no result yet</span
      >
    </summary>
    <div class="pt-1 pr-3 pb-3 pl-[calc(0.75rem+3px+0.625rem)]">
      <h3 class="mt-3 mb-1.5 text-[0.8125rem] font-semibold text-muted">Input</h3>
      <pre
        class="max-h-96 overflow-auto rounded-sm bg-bg px-3.5 py-2.5 leading-relaxed wrap-anywhere whitespace-pre-wrap"
        >{{ call.args }}</pre>
      <template v-if="call.result">
        <h3 class="mt-3 mb-1.5 text-[0.8125rem] font-semibold text-muted">Output</h3>
        <pre
          class="max-h-96 overflow-auto rounded-sm bg-bg px-3.5 py-2.5 leading-relaxed wrap-anywhere whitespace-pre-wrap"
          >{{ call.result.text || "(empty)" }}</pre>
      </template>
    </div>
  </details>
</template>
