export function createDebounce<A extends unknown[]>(ms: number, fn: (...args: A) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let storedArgs: A | undefined;
  return {
    call(...args: A) {
      storedArgs = args;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn(...storedArgs!);
        storedArgs = undefined;
      }, ms);
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      storedArgs = undefined;
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
        fn(...storedArgs!);
        storedArgs = undefined;
      }
    },
  };
}

export function createKeyedDebounce<K>(ms: number, fn: (keys: Set<K>) => void) {
  const timers = new Map<K, ReturnType<typeof setTimeout>>();
  const pending = new Set<K>();

  function fire() {
    const keys = new Set(pending);
    pending.clear();
    for (const [, t] of timers) clearTimeout(t);
    timers.clear();
    if (keys.size > 0) fn(keys);
  }

  return {
    schedule(key: K) {
      pending.add(key);
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fire();
        }, ms),
      );
    },
    cancel(key: K) {
      clearTimeout(timers.get(key));
      timers.delete(key);
      pending.delete(key);
    },
    cancelAll() {
      for (const [, t] of timers) clearTimeout(t);
      timers.clear();
      pending.clear();
    },
    flush() {
      fire();
    },
  };
}

export function createThrottle<T>(ms: number, fn: (items: T[]) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let items: T[] = [];
  return {
    push(item: T) {
      items.push(item);
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          const batch = items;
          items = [];
          fn(batch);
        }, ms);
    },
    flush() {
      if (items.length > 0) {
        clearTimeout(timer);
        timer = undefined;
        const batch = items;
        items = [];
        fn(batch);
      }
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      items = [];
    },
  };
}
