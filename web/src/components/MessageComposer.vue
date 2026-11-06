<script setup lang="ts">
import { computed, ref } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";

const MAX_CHARS = 8000;
const FINISHED: readonly IssuePhase[] = ["done", "failed", "aborted"];

const props = defineProps<{ repo: string; issue: string; phase: IssuePhase }>();

const text = ref("");
const sending = ref(false);
const error = ref<string | null>(null);

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
      body: JSON.stringify({ id: crypto.randomUUID(), text: text.value }),
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
  <form class="composer" @submit.prevent="send">
    <label for="message" class="label">
      {{ finished ? "Continue this run with a follow-up" : "Steer the agent while it works" }}
    </label>
    <textarea
      id="message"
      v-model="text"
      rows="3"
      :maxlength="MAX_CHARS"
      :disabled="sending"
      placeholder="Message the agent…"
      @keydown.enter.meta.prevent="send"
      @keydown.enter.ctrl.prevent="send"
    ></textarea>
    <div class="actions">
      <p v-if="error" class="error" role="alert">Couldn't send: {{ error }}</p>
      <span class="hint muted">⌘/Ctrl + Enter</span>
      <button type="submit" :disabled="!canSend">{{ sending ? "Sending…" : finished ? "Continue" : "Steer" }}</button>
    </div>
  </form>
</template>

<style scoped>
.composer {
  display: grid;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--muted);
}
textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 4.5rem;
  padding: 0.625rem 0.75rem;
  resize: vertical;
  font: inherit;
  line-height: 1.5;
  color: var(--ink);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 4px;
}
textarea:disabled {
  opacity: 0.6;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem 1rem;
}
.error {
  margin: 0 auto 0 0;
  font-size: 0.875rem;
  color: var(--bad);
  overflow-wrap: anywhere;
}
.hint {
  font-size: 0.8125rem;
}
button {
  min-height: 2.25rem;
  padding: 0 1.125rem;
  font: inherit;
  font-weight: 600;
  color: var(--surface);
  background: var(--run);
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
button:disabled {
  cursor: default;
  opacity: 0.5;
}
</style>
