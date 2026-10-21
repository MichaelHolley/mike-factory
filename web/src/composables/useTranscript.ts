import type { TranscriptItem } from "../../../src/runStatus.ts";
import { usePolling } from "./usePolling.ts";

export function useTranscript(repo: () => string, issue: () => string) {
  const { data: items, error, loaded } = usePolling<TranscriptItem[]>(
    () => `/status/${encodeURIComponent(repo())}/${encodeURIComponent(issue())}/conversation`,
    [],
  );
  return { items, error, loaded };
}
