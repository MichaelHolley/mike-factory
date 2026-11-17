<script setup lang="ts">
import { ArrowUp, Command, CornerDownLeft, LoaderCircle } from "@lucide/vue";
import { Button } from "@ui-sdk/vue/button";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field";
import { Textarea } from "@ui-sdk/vue/textarea";
import { computed, ref, watch } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import PhaseBadge from "./PhaseBadge.vue";

const MAX_CHARS = 8000;
const FINISHED: readonly IssuePhase[] = ["done", "failed", "aborted"];

const props = defineProps<{ repo: string; issue: string; phase: IssuePhase }>();

const text = ref("");
const sending = ref(false);
const error = ref<string | null>(null);
// Kept across retries of the same text, so a send that failed after the server stored it isn't added twice.
let id = crypto.randomUUID();
watch(text, () => (id = crypto.randomUUID()));

const finished = computed(() => FINISHED.includes(props.phase));
const canSend = computed(() => !sending.value && text.value.trim() !== "" && text.value.length <= MAX_CHARS);

async function send() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = null;
  try {
    const url = `/status/${encodeURIComponent(props.repo)}/${encodeURIComponent(props.issue)}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, text: text.value }),
    });
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
    text.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <form
    class="relative z-10 mt-5 rounded-xl border border-line bg-surface shadow-sm focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/15 md:sticky md:bottom-4"
    @submit.prevent="send"
  >
    <Field class="gap-0">
      <Textarea
        v-model:value="text"
        auto-resize
        submit-shortcut="mod+enter"
        class="max-h-64 min-h-24 resize-none rounded-none border-0 bg-transparent px-4 pt-4 pb-2 text-base leading-relaxed shadow-none focus-visible:outline-none disabled:opacity-60"
        rows="2"
        :maxlength="MAX_CHARS"
        :disabled="sending"
        placeholder="Message the agent…"
      />
      <p v-if="error" class="px-4 pb-3 text-sm text-bad wrap-anywhere" role="alert">Couldn't send: {{ error }}</p>
      <div class="flex flex-wrap items-center justify-between gap-3 px-4 pb-3">
        <FieldLabel class="sr-only">
          {{ finished ? "Continue this run with a follow-up" : "Steer the agent while it works" }}
        </FieldLabel>
        <div role="status" aria-atomic="true">
          <span class="sr-only">Current pipeline phase: </span>
          <PhaseBadge :phase="phase" />
        </div>
        <FieldDescription class="sr-only items-center gap-1 text-xs text-muted sm:not-sr-only sm:ml-auto sm:flex">
          <span class="sr-only">Send with Command or Control plus Enter</span>
          <Command class="size-3" aria-hidden="true" /><span aria-hidden="true">/ Ctrl +</span
          ><CornerDownLeft class="size-3" aria-hidden="true" />
        </FieldDescription>
        <Button
          type="submit"
          :disabled="!canSend"
          focusable-when-disabled
          :aria-busy="sending"
          :aria-label="sending ? 'Sending message' : finished ? 'Continue run' : 'Steer agent'"
          class="ml-auto size-10 flex-none rounded-full border-0 bg-run p-0 text-surface hover:bg-run/90 sm:ml-0"
        >
          <component
            :is="sending ? LoaderCircle : ArrowUp"
            class="size-5"
            :class="sending && 'animate-spin motion-reduce:animate-none'"
            aria-hidden="true"
          />
        </Button>
      </div>
    </Field>
  </form>
</template>
