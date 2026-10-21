export interface Slots {
  /** Resolves once `key` holds one of the slots; resolves at once if it already holds one. Rejects if `signal` aborts first. */
  acquire(key: number, signal?: AbortSignal): Promise<void>;
  /** Frees the slot of `key`, if any, for the longest waiter. */
  release(key: number): void;
}

/** Limits how many keys hold a slot at once. A key keeps its slot across calls until released. */
export function createSlots(limit: number): Slots {
  const held = new Set<number>();
  const waiters: { key: number; grant: () => void }[] = [];

  const grantNext = () => {
    while (held.size < limit && waiters.length > 0) {
      const next = waiters.shift()!;
      held.add(next.key);
      next.grant();
    }
  };

  return {
    acquire(key, signal) {
      if (held.has(key)) return Promise.resolve();
      if (signal?.aborted) return Promise.reject(signal.reason);
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) waiters.splice(index, 1);
          reject(signal?.reason);
        };
        const waiter = {
          key,
          grant: () => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          },
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        waiters.push(waiter);
        grantNext();
      });
    },

    release(key) {
      if (held.delete(key)) grantNext();
    },
  };
}
