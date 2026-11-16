<script setup lang="ts">
import { MessageSquareDiff } from "@lucide/vue";
import type { ReviewCard } from "../../../src/runStatus.ts";
import MarkdownText from "./MarkdownText.vue";
import OutboundLink from "./OutboundLink.vue";

defineProps<{ review: ReviewCard }>();

const STATES: Record<string, string> = {
  changes_requested: "requested changes",
  commented: "commented",
  approved: "approved",
};

const place = (comment: ReviewCard["comments"][number]) =>
  comment.line === null ? comment.path : `${comment.path}:${comment.line}`;
</script>

<template>
  <div class="text-sm">
    <OutboundLink :href="review.url" :icon="MessageSquareDiff" class="font-medium text-you">
      {{ review.reviewer }} {{ STATES[review.state] ?? review.state }}
    </OutboundLink>
    <ul v-if="review.comments.length" class="mt-2 space-y-2">
      <li v-for="(comment, i) in review.comments" :key="i" class="rounded-md border border-line bg-surface px-3 py-2">
        <OutboundLink :href="comment.url" class="font-mono text-xs text-muted hover:text-ink">{{
          place(comment)
        }}</OutboundLink>
        <MarkdownText :text="comment.body" class="mt-1 leading-relaxed wrap-anywhere" />
      </li>
    </ul>
  </div>
</template>
