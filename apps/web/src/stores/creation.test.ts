import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CreationProgress } from "@iara/contracts";

// ---------------------------------------------------------------------------
// Transport mock — capture the subscribe callback at module load
// ---------------------------------------------------------------------------

const { mockRequest, mockSubscribe, capturedCallbacks } = vi.hoisted(() => {
  const capturedCallbacks: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    mockRequest: vi.fn(),
    mockSubscribe: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!capturedCallbacks[event]) capturedCallbacks[event] = [];
      capturedCallbacks[event].push(cb);
      return vi.fn();
    }),
    capturedCallbacks,
  };
});

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
  },
}));

// Must import after vi.mock
import { useCreationStore } from "./creation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgress(overrides: Partial<CreationProgress> = {}): CreationProgress {
  return {
    requestId: "req-1",
    type: "project",
    stage: "creating",
    ...overrides,
  };
}

function getProgressCb(): (params: CreationProgress) => void {
  const cbs = capturedCallbacks["creation:progress"];
  if (!cbs || cbs.length === 0) throw new Error("No creation:progress callback captured");
  return cbs[0] as (params: CreationProgress) => void;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useCreationStore.setState({
    entries: new Map(),
    onProgressCallbacks: new Set(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCreationStore", () => {
  // -----------------------------------------------------------------------
  // WS subscription at module load
  // -----------------------------------------------------------------------

  it("subscribes to 'creation:progress' on module load", () => {
    expect(mockSubscribe).toHaveBeenCalledWith("creation:progress", expect.any(Function));
    expect(capturedCallbacks["creation:progress"]).toBeDefined();
    expect(capturedCallbacks["creation:progress"]!.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Progress events update entries
  // -----------------------------------------------------------------------

  describe("creation:progress events", () => {
    it("updates entries when a progress event arrives", () => {
      const progress = makeProgress({ requestId: "r1", stage: "creating", name: "My Project" });

      getProgressCb()(progress);

      const entries = useCreationStore.getState().entries;
      expect(entries.has("r1")).toBe(true);
      expect(entries.get("r1")).toEqual({
        requestId: "r1",
        type: "project",
        stage: "creating",
        name: "My Project",
      });
    });

    it("calls listener callbacks when progress events arrive", () => {
      const listener = vi.fn();
      useCreationStore.getState().addListener(listener);

      const progress = makeProgress({ requestId: "r2", stage: "suggested" });

      getProgressCb()(progress);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "r2", stage: "suggested" }),
      );
    });

    it("cleans up entries after 'done' stage with delay", () => {
      vi.useFakeTimers();

      const progress = makeProgress({ requestId: "r-done", stage: "done", entityId: "proj-123" });

      getProgressCb()(progress);

      // Entry should exist immediately
      expect(useCreationStore.getState().entries.has("r-done")).toBe(true);

      // After 15 seconds, entry should be cleaned up
      vi.advanceTimersByTime(15_000);
      expect(useCreationStore.getState().entries.has("r-done")).toBe(false);

      vi.useRealTimers();
    });

    it("cleans up entries after 'error' stage with delay", () => {
      vi.useFakeTimers();

      const progress = makeProgress({
        requestId: "r-err",
        stage: "error",
        error: "Something failed",
      });

      getProgressCb()(progress);

      expect(useCreationStore.getState().entries.has("r-err")).toBe(true);

      vi.advanceTimersByTime(15_000);
      expect(useCreationStore.getState().entries.has("r-err")).toBe(false);

      vi.useRealTimers();
    });

    it("tracks multiple concurrent creations independently", () => {
      const cb = getProgressCb();
      cb(makeProgress({ requestId: "a", type: "project", stage: "creating", name: "P1" }));
      cb(makeProgress({ requestId: "b", type: "task", stage: "suggesting", name: "T1" }));

      const entries = useCreationStore.getState().entries;
      expect(entries.size).toBe(2);
      expect(entries.get("a")!.name).toBe("P1");
      expect(entries.get("a")!.type).toBe("project");
      expect(entries.get("b")!.name).toBe("T1");
      expect(entries.get("b")!.type).toBe("task");

      // Update one without affecting the other
      cb(
        makeProgress({
          requestId: "a",
          type: "project",
          stage: "done",
          name: "P1",
          entityId: "id-a",
        }),
      );

      expect(useCreationStore.getState().entries.get("a")!.stage).toBe("done");
      expect(useCreationStore.getState().entries.get("b")!.stage).toBe("suggesting");
    });
  });

  // -----------------------------------------------------------------------
  // addListener
  // -----------------------------------------------------------------------

  describe("addListener()", () => {
    it("returns an unsubscribe function that works", () => {
      const listener = vi.fn();
      const unsub = useCreationStore.getState().addListener(listener);

      const cb = getProgressCb();

      cb(makeProgress({ requestId: "r1" }));
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsub();

      cb(makeProgress({ requestId: "r2" }));
      // Should not be called again
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
