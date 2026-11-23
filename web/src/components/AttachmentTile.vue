<script setup lang="ts">
import { formatFileSize } from "@ui-sdk/vue/file-input";
import { fileIcon } from "../attachments.ts";

defineProps<{ name: string; size: number; src?: string }>();
</script>

<template>
  <li
    class="relative flex h-12 max-w-64 min-w-0 items-center gap-2.5 rounded-md border border-line bg-surface py-0 pr-1 pl-0 text-sm"
  >
    <img
      v-if="src"
      :src
      alt=""
      loading="lazy"
      decoding="async"
      class="aspect-square h-full flex-none rounded-l-md bg-ink/4 object-cover"
    />
    <span v-else class="grid aspect-square h-full flex-none place-items-center rounded-l-md bg-ink/4 text-muted">
      <component :is="fileIcon(name)" class="size-5" aria-hidden="true" />
    </span>

    <span class="flex min-w-0 flex-1 flex-col text-sm leading-tight text-ink">
      <slot name="name">
        <span class="truncate font-medium">{{ name }}</span>
      </slot>
      <span class="mt-0.5 text-xs text-muted tabular-nums">{{ formatFileSize(size) }}</span>
    </span>

    <slot />
  </li>
</template>
