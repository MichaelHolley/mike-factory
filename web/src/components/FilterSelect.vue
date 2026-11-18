<script setup lang="ts" generic="T extends string">
import { Check, ChevronDown } from "@lucide/vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIcon,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectValueIcon,
} from "@ui-sdk/vue/select";
import type { Component } from "vue";

export type FilterOption<T> = { value: T; label: string; icon?: Component; hue?: string };

defineProps<{ label: string; options: FilterOption<T>[] }>();
const value = defineModel<T>("value", { required: true });
</script>

<template>
  <Select v-model:value="value">
    <SelectLabel class="sr-only">{{ label }}</SelectLabel>
    <SelectTrigger class="w-48 justify-between bg-surface">
      <span class="flex min-w-0 items-center gap-2">
        <SelectValueIcon />
        <SelectValue class="truncate" />
      </span>
      <ChevronDown class="size-4 flex-none text-muted" aria-hidden="true" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="option in options" :key="option.value" :value="option.value">
        <SelectItemIcon v-if="option.icon"><component :is="option.icon" :class="option.hue" /></SelectItemIcon>
        {{ option.label }}
        <SelectItemIndicator><Check /></SelectItemIndicator>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
