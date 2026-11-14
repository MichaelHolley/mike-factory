import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";

const RETRY_MS = 5000;

type LiveEvent<T> = { from: number; items: T[] };

/** Follows a server-sent list stream while started; each event replaces the list from index `from` on. */
export function createLiveList<T>(url: () => string) {
  const data = shallowRef<T[]>([]);
  const error = ref<string | null>(null);
  const loaded = ref(false);
  let source: EventSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function close() {
    clearTimeout(retry);
    source?.close();
    source = undefined;
  }

  function open() {
    close();
    source = new EventSource(url());
    source.onmessage = (event: MessageEvent<string>) => {
      const { from, items } = JSON.parse(event.data) as LiveEvent<T>;
      const next = from === 0 ? [] : data.value.slice(0, from);
      next.push(...items);
      data.value = next;
      error.value = null;
      loaded.value = true;
    };
    source.onerror = () => {
      error.value = "connection lost";
      loaded.value = true;
      // EventSource gives up for good on a non-stream response, such as a proxy 502 while the server restarts.
      if (source?.readyState === EventSource.CLOSED) {
        close();
        retry = setTimeout(open, RETRY_MS);
      }
    };
  }

  function onVisibilityChange() {
    if (document.hidden) close();
    else open();
  }

  function start() {
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden) open();
  }

  function stop() {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    close();
  }

  return { data, error, loaded, start, stop };
}

/** Follows a server-sent list stream while the calling component is mounted. */
export function useLiveList<T>(url: () => string) {
  const { data, error, loaded, start, stop } = createLiveList<T>(url);
  onMounted(start);
  onBeforeUnmount(stop);
  return { data, error, loaded };
}
