import { computed } from "vue";
import type { TranscriptItem } from "../../../src/runStatus.ts";
import { useLiveList } from "./useLiveList.ts";

export function useTranscript(repo: () => string, issue: () => string) {
  const base = () => `/status/${encodeURIComponent(repo())}/${encodeURIComponent(issue())}`;
  const url = () => `${base()}/conversation`;
  const { data: items, error, loaded } = useLiveList<TranscriptItem>(() => `${url()}/stream`);
  const downloadUrl = computed(() => `${url()}?download=1`);

  const fileUrl = (path: string) => `${base()}/files/${path.split("/").map(encodeURIComponent).join("/")}`;

  return { items, error, loaded, downloadUrl, fileUrl };
}
