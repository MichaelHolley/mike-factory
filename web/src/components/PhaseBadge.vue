<script setup lang="ts">
import type { IssuePhase } from "../../../src/runStatus.ts";

defineProps<{ phase: IssuePhase }>();
</script>

<template>
  <span class="badge" :class="phase">{{ phase }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  background: #6b728022;
  color: #4b5563;
}
.queued {
  background: #6b728022;
  color: #6b7280;
}
.prepare,
.implement,
.fix {
  background: #2563eb22;
  color: #2563eb;
}
.verify,
.publish,
.report {
  background: #d9770622;
  color: #d97706;
}
.done {
  background: #16a34a22;
  color: #16a34a;
}
.failed {
  background: #dc262622;
  color: #dc2626;
}
.aborted {
  background: #7c3aed22;
  color: #7c3aed;
}
</style>
