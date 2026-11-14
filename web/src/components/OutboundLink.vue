<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip";
import type { Component } from "vue";

defineProps<{ href: string; icon?: Component }>();
</script>

<template>
  <Tooltip type="description">
    <TooltipTrigger>
      <template #render="{ props: trigger, children }">
        <a v-bind="trigger" :href target="_blank" rel="noopener" class="inline-flex items-center gap-1.5"
          ><component :is="children"
        /></a>
      </template>
      <component :is="icon" v-if="icon" class="size-3.5 flex-none" aria-hidden="true" />
      <span><slot /></span>
      <ExternalLink class="size-3 flex-none opacity-70" aria-hidden="true" />
    </TooltipTrigger>
    <TooltipContent class="max-w-sm wrap-anywhere">{{ href }}</TooltipContent>
  </Tooltip>
</template>
