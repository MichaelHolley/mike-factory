<script setup lang="ts">
import { ArrowUp, Command, CornerDownLeft, LoaderCircle, Paperclip, X } from "@lucide/vue";
import { Button } from "@ui-sdk/vue/button";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field";
import {
  createFileInputController,
  FileInput,
  FileInputDropzone,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
  type FileRejection,
  formatFileSize,
} from "@ui-sdk/vue/file-input";
import { Textarea } from "@ui-sdk/vue/textarea";
import { computed, ref, watch } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { isImage } from "../attachments.ts";
import { isIdle } from "../phase.ts";
import AttachmentTile from "./AttachmentTile.vue";
import IconButton from "./IconButton.vue";
import PhaseBadge from "./PhaseBadge.vue";

const MAX_CHARS = 8000;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const props = defineProps<{ repo: string; issue: string; phase: IssuePhase }>();

const text = ref("");
const files = ref<File[]>([]);
const picker = createFileInputController();
const sending = ref(false);
const error = ref<string | null>(null);

// Kept across retries of the same message, so a send that failed after the server stored it isn't added twice.
let id = crypto.randomUUID();
watch([text, files], () => (id = crypto.randomUUID()));

const previews = ref(new Map<File, string>());

watch(
  files,
  (next, _, onCleanup) => {
    const urls = new Map(next.filter((file) => isImage(file.name)).map((file) => [file, URL.createObjectURL(file)]));

    previews.value = urls;
    onCleanup(() => urls.forEach((url) => URL.revokeObjectURL(url)));
  },
  { immediate: true },
);

const finished = computed(() => isIdle(props.phase));

const sendLabel = computed(() => {
  if (sending.value) return "Sending message";

  return finished.value ? "Continue run" : "Steer agent";
});

const canSend = computed(
  () => !sending.value && (text.value.trim() !== "" || files.value.length > 0) && text.value.length <= MAX_CHARS,
);

const REJECTIONS: Record<string, string> = {
  "file-too-large": `is over ${formatFileSize(MAX_FILE_BYTES)}`,
  "too-many-files": `would go over ${MAX_FILES} files`,
};

function rejected(rejections: FileRejection[]) {
  error.value = rejections
    .map(({ file, reasons }) => `${file.name} ${reasons.map((reason) => REJECTIONS[reason] ?? reason).join(", ")}`)
    .join("; ");
}

async function send() {
  if (!canSend.value) return;

  sending.value = true;
  error.value = null;

  try {
    const url = `/status/${encodeURIComponent(props.repo)}/${encodeURIComponent(props.issue)}/messages`;
    const body = new FormData();

    body.append("id", id);
    body.append("text", text.value);
    for (const file of files.value) body.append("files", file);

    const response = await fetch(url, { method: "POST", headers: { "x-mike-request": "1" }, body });
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);

    text.value = "";
    files.value = [];
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
    <FileInput
      v-model:value="files"
      :controller="picker"
      multiple
      :max-files="MAX_FILES"
      :max-size="MAX_FILE_BYTES"
      :disabled="sending"
      class="max-w-none gap-0"
      @reject="rejected"
    >
      <FileInputDropzone class="items-stretch gap-0 rounded-xl border-0 p-0 text-left text-ink data-dragging:bg-run/5">
        <Field class="gap-0">
          <FileInputList aria-label="Attachments">
            <template #render="{ props: list, children }">
              <ul v-bind="list" class="flex-row flex-wrap gap-2 rounded-none border-0 px-4 pt-4">
                <component :is="children" />
              </ul>
            </template>

            <FileInputItem>
              <template #render="{ props: item, state }">
                <AttachmentTile
                  v-bind="item"
                  :name="state.file.name"
                  :detail="formatFileSize(state.file.size)"
                  :src="previews.get(state.file)"
                  class="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <FileInputItemRemove
                    class="inline-grid size-7 flex-none place-items-center rounded-md border-0 bg-transparent p-0 text-muted hover:bg-ink/6 hover:text-ink"
                  >
                    <X class="size-4" aria-hidden="true" />
                  </FileInputItemRemove>
                </AttachmentTile>
              </template>
            </FileInputItem>
          </FileInputList>

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

            <!-- A FileInputTrigger would become the field's control in place of the textarea. -->
            <IconButton
              :icon="Paperclip"
              label="Attach files"
              :disabled="sending"
              class="ml-auto sm:ml-0"
              @click="picker.open()"
            />

            <Button
              type="submit"
              :disabled="!canSend"
              focusable-when-disabled
              :aria-busy="sending"
              :aria-label="sendLabel"
              class="size-10 flex-none rounded-full border-0 bg-run p-0 text-surface hover:bg-run/90"
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
      </FileInputDropzone>
    </FileInput>
  </form>
</template>
