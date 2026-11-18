import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";

const PAGE = 30;

/**
 * Shows `items` a page at a time, adding the next page when `sentinel` nears the bottom of `root`
 * (the viewport when omitted). Render `sentinel` after the list while `more` is true.
 */
export function useLazyList<T>(items: Ref<readonly T[]>, root?: Ref<HTMLElement | null>) {
  const shown = ref(PAGE);
  const sentinel = shallowRef<HTMLElement | null>(null);
  const visible = computed(() => items.value.slice(0, shown.value));
  const more = computed(() => shown.value < items.value.length);

  let observer: IntersectionObserver | undefined;
  // A fresh observer reports on observe, so a page too short to scroll still loads the next one.
  watch(
    [sentinel, shown, () => items.value.length],
    async () => {
      observer?.disconnect();
      if (!sentinel.value) return;
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) shown.value += PAGE;
        },
        { root: root?.value, rootMargin: "0px 0px 240px 0px" },
      );
      await nextTick();
      if (sentinel.value) observer.observe(sentinel.value);
    },
    { flush: "post" },
  );
  onBeforeUnmount(() => observer?.disconnect());

  function reset() {
    shown.value = PAGE;
    root?.value?.scrollTo({ top: 0 });
  }

  return { visible, more, sentinel, reset };
}
