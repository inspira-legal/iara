import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { LocalCache, MapCache } from "./local-cache";

// Mock localStorage
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (_index: number) => null,
};
Object.defineProperty(globalThis, "localStorage", { value: mockLocalStorage });

// ---------------------------------------------------------------------------
// LocalCache
// ---------------------------------------------------------------------------

describe("LocalCache", () => {
  const schema = z.object({ name: z.string(), count: z.number() });
  let cache: LocalCache<z.infer<typeof schema>>;

  beforeEach(() => {
    storage.clear();
    cache = new LocalCache({ key: "test:cache", version: 1, schema });
  });

  it("returns null when empty", () => {
    expect(cache.get()).toBeNull();
  });

  it("round-trips valid data", () => {
    cache.set({ name: "hello", count: 42 });
    expect(cache.get()).toEqual({ name: "hello", count: 42 });
  });

  it("returns null and clears on version mismatch", () => {
    cache.set({ name: "v1", count: 1 });
    const v2 = new LocalCache({ key: "test:cache", version: 2, schema });
    expect(v2.get()).toBeNull();
    // Old entry should be removed
    expect(storage.has("test:cache")).toBe(false);
  });

  it("returns null and clears on corrupt JSON", () => {
    storage.set("test:cache", "not-json{{{");
    expect(cache.get()).toBeNull();
    expect(storage.has("test:cache")).toBe(false);
  });

  it("returns null and clears on Zod validation failure", () => {
    storage.set("test:cache", JSON.stringify({ v: 1, data: { name: 123 } }));
    expect(cache.get()).toBeNull();
    expect(storage.has("test:cache")).toBe(false);
  });

  it("clear removes the entry", () => {
    cache.set({ name: "a", count: 1 });
    cache.clear();
    expect(cache.get()).toBeNull();
  });

  it("set swallows quota errors", () => {
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => {
      throw new DOMException("quota exceeded");
    };
    // Should not throw
    expect(() => cache.set({ name: "a", count: 1 })).not.toThrow();
    mockLocalStorage.setItem = originalSetItem;
  });
});

// ---------------------------------------------------------------------------
// MapCache
// ---------------------------------------------------------------------------

describe("MapCache", () => {
  const schema = z.object({ value: z.string() });
  let cache: MapCache<z.infer<typeof schema>>;

  beforeEach(() => {
    storage.clear();
    cache = new MapCache({ key: "test:map", version: 1, schema, maxEntries: 3 });
  });

  it("returns null for missing entry", () => {
    expect(cache.getEntry("nope")).toBeNull();
  });

  it("round-trips a single entry", () => {
    cache.setEntry("a", { value: "hello" });
    expect(cache.getEntry("a")).toEqual({ value: "hello" });
  });

  it("getAll returns all valid entries", () => {
    cache.setEntry("a", { value: "1" });
    cache.setEntry("b", { value: "2" });
    expect(cache.getAll()).toEqual({ a: { value: "1" }, b: { value: "2" } });
  });

  it("removeEntry removes an entry", () => {
    cache.setEntry("a", { value: "1" });
    cache.removeEntry("a");
    expect(cache.getEntry("a")).toBeNull();
  });

  it("evicts LRU entries when over maxEntries", () => {
    cache.setEntry("a", { value: "1" });
    cache.setEntry("b", { value: "2" });
    cache.setEntry("c", { value: "3" });
    // a is the oldest — adding d should evict a
    cache.setEntry("d", { value: "4" });
    expect(cache.getEntry("a")).toBeNull();
    expect(cache.getEntry("b")).toEqual({ value: "2" });
    expect(cache.getEntry("d")).toEqual({ value: "4" });
  });

  it("accessing an entry updates LRU order", () => {
    cache.setEntry("a", { value: "1" });
    cache.setEntry("b", { value: "2" });
    cache.setEntry("c", { value: "3" });
    // Touch a — now b is the oldest
    cache.getEntry("a");
    cache.setEntry("d", { value: "4" });
    expect(cache.getEntry("a")).toEqual({ value: "1" });
    expect(cache.getEntry("b")).toBeNull(); // b evicted
  });

  it("returns null and removes invalid entries on getEntry", () => {
    // Manually inject invalid data
    const envelope = { v: 1, entries: { bad: { value: 123 } }, order: ["bad"] };
    storage.set("test:map", JSON.stringify(envelope));
    expect(cache.getEntry("bad")).toBeNull();
    // Should have been removed
    const raw = JSON.parse(storage.get("test:map")!);
    expect(raw.entries).not.toHaveProperty("bad");
  });

  it("getAll filters out invalid entries", () => {
    const envelope = {
      v: 1,
      entries: { good: { value: "ok" }, bad: { value: 123 } },
      order: ["good", "bad"],
    };
    storage.set("test:map", JSON.stringify(envelope));
    expect(cache.getAll()).toEqual({ good: { value: "ok" } });
  });

  it("returns null on version mismatch", () => {
    cache.setEntry("a", { value: "1" });
    const v2 = new MapCache({ key: "test:map", version: 2, schema });
    expect(v2.getEntry("a")).toBeNull();
  });

  it("clear removes everything", () => {
    cache.setEntry("a", { value: "1" });
    cache.clear();
    expect(cache.getAll()).toEqual({});
  });
});
