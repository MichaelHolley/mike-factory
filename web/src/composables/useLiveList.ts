import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";

type LiveEvent<T> = { from: number; items: T[] };

/** Follows a server-sent list stream; each event replaces the list from index `from` on. */
export function useLiveList<T>(url: () => string) {
  const data = shallowRef<T[]>([]);
  const error = ref<string | null>(null);
  const loaded = ref(false);
  let source: EventSource | undefined;

  function close() {
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
    };
  }

  function onVisibilityChange() {
    if (document.hidden) close();
    else open();
  }

  watch(url, () => source && open());

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden) open();
  });

  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    close();
  });

  return { data, error, loaded };
}
