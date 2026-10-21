import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";

const POLL_MS = 5000;

export function usePolling<T>(url: () => string, initial: T) {
  const data = shallowRef(initial);
  const error = ref<string | null>(null);
  const loaded = ref(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refresh() {
    try {
      const res = await fetch(url());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data.value = (await res.json()) as T;
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

  return { data, error, loaded };
}
