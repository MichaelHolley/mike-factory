import { onBeforeUnmount, onMounted, ref } from "vue";
import type { RunStatus } from "../../../src/runStatus.ts";

const POLL_MS = 5000;

export function useRuns() {
  const runs = ref<RunStatus[]>([]);
  const error = ref<string | null>(null);
  const loaded = ref(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refresh() {
    try {
      const res = await fetch("/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      runs.value = (await res.json()) as RunStatus[];
      error.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loaded.value = true;
    }
  }

  function stop() {
    clearInterval(timer);
    timer = undefined;
  }

  function start() {
    stop();
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
  }

  function onVisibilityChange() {
    if (document.hidden) stop();
    else start();
  }

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden) start();
  });

  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    stop();
  });

  return { runs, error, loaded };
}
