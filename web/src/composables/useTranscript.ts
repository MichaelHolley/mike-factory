import { computed } from "vue";
import type { TranscriptItem } from "../../../src/runStatus.ts";
import { useLiveList } from "./useLiveList.ts";

export function useTranscript(repo: () => string, issue: () => string) {
  const url = () => `/status/${encodeURIComponent(repo())}/${encodeURIComponent(issue())}/conversation`;
  const { data: items, error, loaded } = useLiveList<TranscriptItem>(() => `${url()}/stream`);
  const downloadUrl = computed(() => `${url()}?download=1`);
  return { items, error, loaded, downloadUrl };
}
