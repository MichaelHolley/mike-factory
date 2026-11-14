<script setup lang="ts">
import { Button } from "@ui-sdk/vue/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip";
import type { Component } from "vue";

defineOptions({ inheritAttrs: false });
defineProps<{ icon: Component; label: string; href?: string; tone?: "chrome" }>();
</script>

<template>
  <Tooltip type="label" :close-on-press="false">
    <TooltipTrigger v-bind="$attrs">
      <template #render="{ props: trigger }">
        <Button
          v-bind="trigger"
          class="inline-grid size-7 flex-none place-items-center border-0 bg-transparent p-0 no-underline"
          :class="
            tone === 'chrome'
              ? 'text-chrome-ink/80 hover:bg-chrome-ink/10 hover:text-chrome-ink'
              : 'text-muted hover:bg-ink/6 hover:text-ink'
          "
        >
          <template v-if="href" #render="{ props: button, children }">
            <a v-bind="button" :href><component :is="children" /></a>
          </template>
          <component :is="icon" class="size-4" aria-hidden="true" />
        </Button>
      </template>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip>
</template>
