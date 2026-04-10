import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebounce, createKeyedDebounce, createThrottle } from "./timing.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createDebounce", () => {
  it("calls fn after delay", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createDebounce(100, fn);
    d.call("a");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("resets timer on subsequent calls", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createDebounce(100, fn);
    d.call("a");
    vi.advanceTimersByTime(80);
    d.call("b");
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("cancel prevents fire", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createDebounce(100, fn);
    d.call("a");
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it("flush fires immediately with stored args", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createDebounce(100, fn);
    d.call("a", "b");
    d.flush();
    expect(fn).toHaveBeenCalledWith("a", "b");
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("flush with no pending is no-op", () => {
    const fn = vi.fn();
    const d = createDebounce(100, fn);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("createKeyedDebounce", () => {
  it("batches multiple keys", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createKeyedDebounce<string>(100, fn);
    d.schedule("a");
    d.schedule("b");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    const keys = fn.mock.calls[0]![0] as Set<string>;
    expect(keys).toEqual(new Set(["a", "b"]));
  });

  it("re-scheduling a key resets its timer", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createKeyedDebounce<string>(100, fn);
    d.schedule("a");
    vi.advanceTimersByTime(80);
    d.schedule("a");
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("cancel removes a single key", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createKeyedDebounce<string>(100, fn);
    d.schedule("a");
    d.schedule("b");
    d.cancel("a");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    const keys = fn.mock.calls[0]![0] as Set<string>;
    expect(keys).toEqual(new Set(["b"]));
  });

  it("cancelAll clears everything", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createKeyedDebounce<string>(100, fn);
    d.schedule("a");
    d.schedule("b");
    d.cancelAll();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it("flush fires immediately with all pending keys", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createKeyedDebounce<string>(100, fn);
    d.schedule("a");
    d.schedule("b");
    d.flush();
    expect(fn).toHaveBeenCalledOnce();
    const keys = fn.mock.calls[0]![0] as Set<string>;
    expect(keys).toEqual(new Set(["a", "b"]));
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("flush with no pending is no-op", () => {
    const fn = vi.fn();
    const d = createKeyedDebounce<string>(100, fn);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("createThrottle", () => {
  it("batches items and fires after delay", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = createThrottle<string>(100, fn);
    t.push("a");
    t.push("b");
    t.push("c");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("schedules timer only on first push", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = createThrottle<string>(100, fn);
    t.push("a");
    vi.advanceTimersByTime(50);
    t.push("b");
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith(["a", "b"]);
  });

  it("flush fires immediately", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = createThrottle<string>(100, fn);
    t.push("a");
    t.push("b");
    t.flush();
    expect(fn).toHaveBeenCalledWith(["a", "b"]);
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("flush with no items is no-op", () => {
    const fn = vi.fn();
    const t = createThrottle<string>(100, fn);
    t.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel clears timer and discards items", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = createThrottle<string>(100, fn);
    t.push("a");
    t.push("b");
    t.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it("accumulates across multiple batches", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = createThrottle<number>(100, fn);
    t.push(1);
    t.push(2);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith([1, 2]);

    t.push(3);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith([3]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
