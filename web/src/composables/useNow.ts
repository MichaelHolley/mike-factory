import { onBeforeUnmount, ref } from "vue";

const TICK_MS = 15_000;

export function useNow() {
  const now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), TICK_MS);
  onBeforeUnmount(() => clearInterval(timer));
  return now;
}
