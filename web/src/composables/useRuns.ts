import { onBeforeUnmount, onMounted } from "vue";
import type { RunStatus } from "../../../src/runStatus.ts";
import { createLiveList } from "./useLiveList.ts";

const stream = createLiveList<RunStatus>(() => "/status/stream");
let users = 0;

/** The run list, shared by every mounted caller over one stream. */
export function useRuns() {
  onMounted(() => {
    if (users++ === 0) stream.start();
  });
  onBeforeUnmount(() => {
    if (--users === 0) stream.stop();
  });
  return { runs: stream.data, error: stream.error, loaded: stream.loaded };
}
