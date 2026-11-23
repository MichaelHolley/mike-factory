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
  formatFileSize,
  type FileRejection,
} from "@ui-sdk/vue/file-input";
import { Textarea } from "@ui-sdk/vue/textarea";
import { computed, onBeforeUnmount, ref, shallowReactive, watch } from "vue";
import { ATTACHMENT_LIMITS, type IssuePhase } from "../../../src/runStatus.ts";
import { isImage } from "../attachments.ts";
import { isIdle } from "../phase.ts";
import AttachmentTile from "./AttachmentTile.vue";
import IconButton from "./IconButton.vue";
import PhaseBadge from "./PhaseBadge.vue";

const MAX_CHARS = 8000;

const props = defineProps<{ repo: string; issue: string; phase: IssuePhase }>();

const text = ref("");
const files = ref<File[]>([]);
const attachments = createFileInputController();
const sending = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
// Kept across retries of the same message, so a send that failed after the server stored it isn't added twice.
let id = crypto.randomUUID();
watch([text, files], () => (id = crypto.randomUUID()));

const previews = shallowReactive(new Map<File, string>());
watch(files, (next) => {
  for (const [file, url] of previews) {
    if (next.includes(file)) continue;
    URL.revokeObjectURL(url);
    previews.delete(file);
  }

  for (const file of next) {
    if (isImage(file.type) && !previews.has(file)) previews.set(file, URL.createObjectURL(file));
  }
});
onBeforeUnmount(() => previews.forEach((url) => URL.revokeObjectURL(url)));

const totalBytes = computed(() => files.value.reduce((total, file) => total + file.size, 0));
const overTotal = computed(() => totalBytes.value > ATTACHMENT_LIMITS.totalBytes);

const finished = computed(() => isIdle(props.phase));
const sendLabel = computed(() => {
  if (sending.value) return "Sending message";
  return finished.value ? "Continue run" : "Steer agent";
});
const canSend = computed(
  () => !sending.value && !overTotal.value && text.value.trim() !== "" && text.value.length <= MAX_CHARS,
);

const problem = computed(() => {
  if (error.value) return `Couldn't send: ${error.value}`;
  if (overTotal.value)
    return `These files add up to ${formatFileSize(totalBytes.value)}, over the ${formatFileSize(ATTACHMENT_LIMITS.totalBytes)} a message can carry. Remove some to send.`;
  return notice.value;
});

const leftOut = ([first, ...rest]: FileRejection[]) =>
  rest.length ? `${first!.file.name} and ${rest.length} more weren't attached` : `${first!.file.name} wasn't attached`;

function onFiles(next: File[]) {
  files.value = next;
  notice.value = null;
}

function onReject(rejected: FileRejection[]) {
  const tooLarge = rejected.filter(({ reasons }) => reasons.includes("file-too-large"));
  const tooMany = rejected.filter(({ reasons }) => !reasons.includes("file-too-large"));

  notice.value = [
    tooLarge.length && `${leftOut(tooLarge)}: files can be at most ${formatFileSize(ATTACHMENT_LIMITS.fileBytes)}.`,
    tooMany.length && `${leftOut(tooMany)}: a message carries at most ${ATTACHMENT_LIMITS.count} files.`,
  ]
    .filter(Boolean)
    .join(" ");
}

async function send() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = null;

  try {
    const body = new FormData();
    body.append("id", id);
    body.append("text", text.value);
    for (const file of files.value) body.append("files", file);

    const url = `/status/${encodeURIComponent(props.repo)}/${encodeURIComponent(props.issue)}/messages`;
    const response = await fetch(url, { method: "POST", headers: { "x-requested-with": "mike-factory" }, body });
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
      multiple
      :max-files="ATTACHMENT_LIMITS.count"
      :max-size="ATTACHMENT_LIMITS.fileBytes"
      :value="files"
      :controller="attachments"
      :disabled="sending"
      class="block max-w-none gap-0"
      @value-change="onFiles"
      @reject="onReject"
    >
      <FileInputDropzone
        target="document"
        class="group/drop block rounded-xl border-0 p-0 text-left text-base text-ink data-dragging:bg-transparent data-disabled:opacity-100"
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

          <FileInputList
            v-if="files.length"
            aria-label="Attachments"
            class="flex flex-row flex-wrap gap-2 rounded-none border-0 px-4 pt-1 pb-3"
          >
            <FileInputItem>
              <template #render="{ props: item, state }">
                <AttachmentTile
                  v-bind="item"
                  :name="state.file.name"
                  :size="state.file.size"
                  :src="previews.get(state.file)"
                  class="transition-[opacity,scale] duration-150 ease-out focus-visible:outline-offset-1 starting:scale-95 starting:opacity-0 motion-reduce:transition-none"
                >
                  <FileInputItemRemove class="hover:bg-ink/6 hover:text-ink">
                    <X class="size-4" aria-hidden="true" />
                  </FileInputItemRemove>
                </AttachmentTile>
              </template>
            </FileInputItem>
          </FileInputList>

          <p v-if="problem" class="px-4 pb-3 text-sm text-bad wrap-anywhere" role="alert">{{ problem }}</p>

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

            <div class="ml-auto flex items-center gap-1 sm:ml-0">
              <IconButton :icon="Paperclip" label="Attach files" @click="attachments.open()" />

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
          </div>
        </Field>

        <div
          class="invisible absolute inset-0 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-you bg-surface/90 font-medium text-you opacity-0 transition-[opacity,visibility] duration-150 ease-out group-data-dragging/drop:visible group-data-dragging/drop:opacity-100 group-data-drag-reject/drop:border-bad group-data-drag-reject/drop:text-bad motion-reduce:transition-none"
          aria-hidden="true"
        >
          <Paperclip class="size-5" />
          <span class="group-data-drag-reject/drop:hidden">Drop files to attach</span>
          <span class="hidden group-data-drag-reject/drop:inline"
            >A message carries at most {{ ATTACHMENT_LIMITS.count }} files</span
          >
        </div>
      </FileInputDropzone>
    </FileInput>
  </form>
</template>
