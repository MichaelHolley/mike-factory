import { computed } from "vue";
import type { TranscriptItem } from "../../../src/runStatus.ts";
import { usePolling } from "./usePolling.ts";

export function useTranscript(repo: () => string, issue: () => string) {
  const url = () => `/status/${encodeURIComponent(repo())}/${encodeURIComponent(issue())}/conversation`;
  const { data: items, error, loaded } = usePolling<TranscriptItem[]>(url, []);
  const downloadUrl = computed(() => `${url()}?download=1`);
  return { items, error, loaded, downloadUrl };
}
