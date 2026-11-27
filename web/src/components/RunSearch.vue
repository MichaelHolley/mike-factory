<script setup lang="ts">
import { Search } from "@lucide/vue";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  createAutocompleteController,
} from "@ui-sdk/vue/autocomplete";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { RunStatus } from "../../../src/runStatus.ts";
import { useRuns } from "../composables/useRuns.ts";
import { searchRuns } from "../search.ts";
import IconButton from "./IconButton.vue";
import PhaseBadge from "./PhaseBadge.vue";

const { runs } = useRuns();
const router = useRouter();
const search = createAutocompleteController();

const query = ref("");
const dismissed = ref(false);
const expanded = ref(false);

const results = computed(() => searchRuns(runs.value, query.value));
// Autocomplete only asks to open when it has items, so the "No matching runs" row needs open driven from the text.
const open = computed(() => !dismissed.value && query.value.trim() !== "");

const key = (run: RunStatus) => `${run.repo}#${run.issue}`;

function reset() {
  search.clear();
  dismissed.value = false;
  expanded.value = false;
}

function onValueChange(next: string, details: { reason: string; cancel: () => void }) {
  if (details.reason === "input-change") dismissed.value = false;
  if (details.reason !== "item-press") return;

  details.cancel();
  const run = results.value.find((candidate) => key(candidate) === next);
  if (run) void router.push(`/runs/${run.repo}/${run.issue}`);
  reset();
}

function onOpenChange(next: boolean, details: { reason: string }) {
  if (!next && details.reason === "escape-key") reset();
  else dismissed.value = !next;
}

async function expand() {
  expanded.value = true;
  await nextTick();
  search.focus();
}

function onShortcut(event: KeyboardEvent) {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;

  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [contenteditable]")) return;

  event.preventDefault();
  void expand();
}

onMounted(() => window.addEventListener("keydown", onShortcut));
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
</script>

<template>
  <IconButton
    v-if="!expanded"
    :icon="Search"
    label="Search runs"
    class="order-last ml-auto md:hidden"
    @click="expand"
  />
  <div
    class="w-full items-center max-md:order-last max-md:ml-auto max-md:max-w-xs md:flex"
    :class="
      expanded
        ? 'flex max-md:absolute max-md:inset-0 max-md:z-10 max-md:max-w-none max-md:bg-canvas max-md:px-4'
        : 'hidden'
    "
  >
    <Autocomplete
      :controller="search"
      v-model:value="query"
      :open
      :filter="false"
      auto-highlight
      @value-change="onValueChange"
      @open-change="onOpenChange"
    >
      <AutocompleteLabel class="sr-only">Search runs</AutocompleteLabel>
      <div class="relative flex flex-1 items-center">
        <Search class="pointer-events-none absolute left-2.5 size-4 text-muted" aria-hidden="true" />
        <AutocompleteInput
          placeholder="Search runs…"
          aria-keyshortcuts="/"
          class="peer bg-bg pr-8 pl-8 placeholder:text-muted"
          @blur="expanded && reset()"
        />
        <kbd
          class="pointer-events-none absolute right-2 rounded-sm border border-line px-1.5 font-mono text-xs leading-5 text-muted peer-focus:invisible peer-not-placeholder-shown:invisible max-md:hidden"
          aria-hidden="true"
          >/</kbd
        >
      </div>
      <AutocompleteContent :side-offset="6" class="p-0">
        <AutocompleteEmpty class="data-empty:px-4 data-empty:py-3">No matching runs</AutocompleteEmpty>
        <AutocompleteList>
          <AutocompleteItem
            v-for="run in results"
            :key="key(run)"
            :value="key(run)"
            :label="key(run)"
            class="gap-4 rounded-none border-l-3 border-transparent py-2 pr-4 pl-3 data-highlighted:border-l-run"
          >
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline gap-2">
                <span class="truncate font-semibold">{{ run.repo }}</span>
                <span class="font-medium text-muted tabular-nums">#{{ run.issue }}</span>
              </span>
              <span v-if="run.title" class="block truncate text-muted">{{ run.title }}</span>
            </span>
            <PhaseBadge :phase="run.phase" class="flex-none" />
          </AutocompleteItem>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  </div>
</template>
