import { computed, onBeforeUnmount, onMounted } from "vue";
import type { RunStatus } from "../../../src/runStatus.ts";
import { isIdle } from "../phase.ts";
import { createLiveList } from "./useLiveList.ts";

const stream = createLiveList<RunStatus>(() => "/status/stream");
let users = 0;

const time = (iso: string | null) => (iso ? Date.parse(iso) : null);

/** The run list, shared by every mounted caller over one stream. */
export function useRuns() {
  onMounted(() => {
    if (users++ === 0) stream.start();
  });

  onBeforeUnmount(() => {
    if (--users === 0) stream.stop();
  });

  const runs = stream.data;

  // Oldest start first so live rows keep their place as updates stream in; queued runs go last.
  const live = computed(() =>
    runs.value
      .filter((run) => !isIdle(run.phase))
      .sort((a, b) => (time(a.startedAt) ?? Infinity) - (time(b.startedAt) ?? Infinity)),
  );

  const inReview = computed(() =>
    runs.value
      .filter((run) => run.phase === "review")
      .sort((a, b) => (time(a.updatedAt) ?? 0) - (time(b.updatedAt) ?? 0)),
  );

  return { runs, live, inReview, error: stream.error, loaded: stream.loaded };
}
