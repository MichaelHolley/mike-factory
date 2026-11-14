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
import { computed, nextTick, ref } from "vue";
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
</script>

<template>
  <IconButton
    v-if="!expanded"
    :icon="Search"
    label="Search runs"
    tone="chrome"
    class="ml-auto sm:hidden"
    @click="expand"
  />
  <div
    class="w-full max-w-md items-center sm:flex"
    :class="expanded ? 'flex max-sm:absolute max-sm:inset-0 max-sm:max-w-none max-sm:bg-chrome max-sm:px-4' : 'hidden'"
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
        <Search class="pointer-events-none absolute left-2.5 size-4 text-chrome-ink/60" aria-hidden="true" />
        <AutocompleteInput
          placeholder="Search runs…"
          class="border-transparent bg-chrome-ink/10 pl-8 text-chrome-ink placeholder:text-chrome-ink/60"
          @blur="expanded && reset()"
        />
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
