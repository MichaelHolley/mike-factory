import type { RunStatus } from "../../../src/runStatus.ts";
import { usePolling } from "./usePolling.ts";

export function useRuns() {
  const { data: runs, error, loaded } = usePolling<RunStatus[]>(() => "/status", []);
  return { runs, error, loaded };
}
