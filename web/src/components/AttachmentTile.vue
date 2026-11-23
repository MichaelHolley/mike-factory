<script setup lang="ts">
import { FileX } from "@lucide/vue";
import { ref } from "vue";
import { fileIcon } from "../attachments.ts";

defineProps<{ name: string; detail?: string; src?: string; skipped?: boolean }>();

const broken = ref(false);
</script>

<template>
  <li
    class="relative flex h-12 max-w-64 min-w-0 items-center gap-2.5 rounded-md border bg-surface py-0 pr-1 pl-0 text-sm"
    :class="skipped ? 'border-dashed border-muted/50' : 'border-line'"
  >
    <img
      v-if="src && !broken"
      :src
      alt=""
      loading="lazy"
      decoding="async"
      class="aspect-square h-full flex-none rounded-l-md bg-ink/4 object-cover"
      @error="broken = true"
    />
    <span v-else class="grid aspect-square h-full flex-none place-items-center rounded-l-md bg-ink/4 text-muted">
      <component :is="skipped ? FileX : fileIcon(name)" class="size-5" aria-hidden="true" />
    </span>

    <span class="flex min-w-0 flex-1 flex-col text-sm leading-tight text-ink">
      <slot name="name">
        <span class="truncate font-medium">{{ name }}</span>
      </slot>
      <span v-if="detail" class="mt-0.5 truncate text-xs text-muted">{{ detail }}</span>
    </span>

    <slot />
  </li>
</template>
