<script setup lang="ts">
import { computed } from "vue";
import type { IssuePhase } from "../../../src/runStatus.ts";
import { phaseTone, pipelineSteps } from "../phase.ts";

const props = defineProps<{ phase: IssuePhase; large?: boolean }>();

const tone = computed(() => phaseTone(props.phase));
const steps = computed(() => pipelineSteps(props.phase));
</script>

<template>
  <ol class="track" :class="[tone, { large }]" aria-label="Pipeline">
    <li v-for="step in steps" :key="step.name" :class="step.state" :aria-current="step.state === 'current' ? 'step' : undefined">
      <span class="label">{{ step.name }}</span>
    </li>
  </ol>
</template>

<style scoped>
.track {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  row-gap: 0.375rem;
  margin: 0 0 0 -0.4375rem;
  padding: 0;
  list-style: none;
  font-size: 0.8125rem;
  --tone: var(--run);
}
.idle {
  --tone: var(--muted);
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
li {
  display: flex;
  align-items: center;
  white-space: nowrap;
}
li + li {
  flex: 1 1 auto;
}
li + li::before {
  content: "";
  flex: 1 1 auto;
  min-width: 0.375rem;
  height: 2px;
  margin: 0 0.25rem;
  background: var(--idle);
}
.passed::before,
.current::before {
  background: var(--tone);
}
.label {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.4375rem;
  border-radius: 3px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--muted);
}
.passed .label {
  color: var(--ink);
}
.current .label {
  font-weight: 600;
  color: #fff;
  background: var(--tone);
}
.run .current .label::before {
  content: "";
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.4s ease-in-out infinite;
}
.large {
  margin-left: -0.625rem;
  font-size: 0.9375rem;
}
.large .label {
  padding: 0.25rem 0.625rem;
}
@media (prefers-color-scheme: dark) {
  .current .label {
    color: var(--bg);
  }
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}
@media (prefers-reduced-motion: reduce) {
  .run .current .label::before {
    animation: none;
  }
}
@media (max-width: 36rem) {
  li + li,
  li + li::before {
    flex: none;
  }
  li + li::before {
    width: 0.625rem;
  }
  .large {
    margin-left: -0.4375rem;
    font-size: 0.8125rem;
  }
  .large .label {
    padding: 0.125rem 0.4375rem;
  }
}
</style>
