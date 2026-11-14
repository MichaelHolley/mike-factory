<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip";
import { RouterLink } from "vue-router";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ to: string; title: string | null; titleEl: () => HTMLElement | undefined }>();

const fits = () => {
  const el = props.titleEl();
  return !el || el.scrollWidth <= el.clientWidth;
};
const anchor = { getBoundingClientRect: () => props.titleEl()?.getBoundingClientRect() ?? new DOMRect() };
</script>

<template>
  <Tooltip type="description" @open-change="(open, details) => open && fits() && details.cancel()">
    <TooltipTrigger v-bind="$attrs">
      <template #render="{ props: trigger, children }">
        <RouterLink v-bind="trigger" :to><component :is="children" /></RouterLink>
      </template>
      <slot />
    </TooltipTrigger>
    <TooltipContent :anchor side="bottom" align="start" class="max-w-sm">{{ title }}</TooltipContent>
  </Tooltip>
</template>
