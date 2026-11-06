import type { RunStatus } from "../../../src/runStatus.ts";
import { useLiveList } from "./useLiveList.ts";

export function useRuns() {
  const { data: runs, error, loaded } = useLiveList<RunStatus>(() => "/status/stream");
  return { runs, error, loaded };
}
