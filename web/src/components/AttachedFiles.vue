<script setup lang="ts">
import { Download, ExternalLink } from "@lucide/vue";
import type { AttachedFile } from "../../../src/runStatus.ts";
import { isImage } from "../attachments.ts";
import AttachmentTile from "./AttachmentTile.vue";
import IconButton from "./IconButton.vue";

const props = defineProps<{ files: AttachedFile[]; fileUrl: (path: string) => string }>();

const href = (file: AttachedFile) => ("path" in file ? props.fileUrl(file.path) : file.source);

// Images and skipped files, which link to GitHub, open in a new tab; anything else is served as a download.
const opens = (file: AttachedFile) =>
  "skipped" in file || isImage(file.name) ? { target: "_blank", rel: "noopener" } : { download: file.name };

const STRETCHED =
  "truncate font-medium text-ink no-underline after:absolute after:inset-0 after:rounded-md hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus";
</script>

<template>
  <ul aria-label="Attachments" class="flex flex-wrap gap-2">
    <AttachmentTile
      v-for="file in files"
      :key="'path' in file ? file.path : file.source"
      :name="file.name"
      :src="'path' in file && isImage(file.name) ? fileUrl(file.path) : undefined"
      :detail="'skipped' in file ? `Not stored: ${file.skipped}` : undefined"
      :skipped="'skipped' in file"
      :title="'skipped' in file ? `Not stored: ${file.skipped}` : undefined"
    >
      <template #name>
        <a :href="href(file)" v-bind="opens(file)" :class="STRETCHED">{{ file.name }}</a>
      </template>

      <IconButton
        v-if="'path' in file && isImage(file.name)"
        :icon="Download"
        :label="`Download ${file.name}`"
        :href="fileUrl(file.path)"
        :download="file.name"
        class="relative"
      />
      <ExternalLink v-else-if="'skipped' in file" class="mr-1.5 size-3.5 flex-none text-muted" aria-hidden="true" />
      <Download v-else class="mr-1.5 size-4 flex-none text-muted" aria-hidden="true" />
    </AttachmentTile>
  </ul>
</template>
