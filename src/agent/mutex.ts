export interface Mutex {
  /** Runs `fn` after every earlier call; a call whose `signal` aborts while it waits rejects without running. */
  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

export function createMutex(): Mutex {
  let tail: Promise<void> = Promise.resolve();
  return {
    async run(fn, signal) {
      const turn = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => (release = resolve));
      try {
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => reject(signal?.reason);
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort, { once: true });
          turn.then(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          });
        });
      } catch (error) {
        void turn.then(release);
        throw error;
      }
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}
