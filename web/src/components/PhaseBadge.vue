<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { phaseTone } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase }>();
const tone = computed(() => phaseTone(props.phase));
</script>

<template>
  <span class="badge" :class="tone">{{ phase }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--tone);
}
.badge::before {
  content: "";
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}
.idle {
  --tone: var(--muted);
}
.run {
  --tone: var(--run);
}
.ok {
  --tone: var(--ok);
}
.bad {
  --tone: var(--bad);
}
.halt {
  --tone: var(--halt);
}
</style>
