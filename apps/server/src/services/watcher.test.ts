import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProjectsWatcher } from "./watcher.js";

const { mockSubscribe } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
}));

vi.mock("@parcel/watcher", () => ({
  subscribe: mockSubscribe,
}));

function createMockAppState(overrides: Record<string, unknown> = {}) {
  return {
    rescanProject: vi.fn().mockReturnValue({ slug: "proj" }),
    scan: vi.fn(),
    getState: vi.fn().mockReturnValue({ projects: [], settings: {} }),
    getProject: vi.fn().mockReturnValue({ slug: "proj" }),
    ...overrides,
  } as any;
}

describe("ProjectsWatcher", () => {
  // biome-ignore lint: test mock
  let pushFn: any;
  let watcherCallback: (_err: unknown, events: Array<{ path: string; type: string }>) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    pushFn = vi.fn();
    mockSubscribe.mockReset();
    mockSubscribe.mockImplementation(async (_dir: string, callback: any, _opts: any) => {
      watcherCallback = callback;
      return { unsubscribe: vi.fn().mockResolvedValue(undefined) };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("start()", () => {
    it("subscribes to the projects directory with correct options", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      expect(mockSubscribe).toHaveBeenCalledWith("/tmp/projects", expect.any(Function), {
        ignore: ["**/.git/**", "**/node_modules/**"],
      });
    });

    it("detects iara-scripts.yaml changes at project root", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcherCallback(null, [
        {
          path: "/tmp/projects/myproj/iara-scripts.yaml",
          type: "update",
        },
      ]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).toHaveBeenCalledWith("myproj");
    });

    it("ignores iara-scripts.yaml in subdirectories", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcherCallback(null, [
        {
          path: "/tmp/projects/myproj/subdir/iara-scripts.yaml",
          type: "update",
        },
      ]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).not.toHaveBeenCalled();
    });

    it("detects workspaces/ directory changes", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcherCallback(null, [
        {
          path: "/tmp/projects/myproj/workspaces/new-ws",
          type: "create",
        },
      ]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).toHaveBeenCalledWith("myproj");
    });

    it("detects .git directory at project root level", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcherCallback(null, [{ path: "/tmp/projects/myproj/.git", type: "create" }]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).toHaveBeenCalledWith("myproj");
    });

    it("ignores .git in deeply nested paths", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcherCallback(null, [
        {
          path: "/tmp/projects/myproj/subdir/deep/.git",
          type: "create",
        },
      ]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).not.toHaveBeenCalled();
    });

    it("suppresses events for own writes", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcher.suppressNext("/tmp/projects/myproj/iara-scripts.yaml");
      watcherCallback(null, [
        {
          path: "/tmp/projects/myproj/iara-scripts.yaml",
          type: "update",
        },
      ]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).not.toHaveBeenCalled();
    });

    it("skips events with empty relative path", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcherCallback(null, [{ path: "/tmp/projects", type: "update" }]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).not.toHaveBeenCalled();
    });

    it("ignores unrelated file changes", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcherCallback(null, [
        {
          path: "/tmp/projects/myproj/random-file.txt",
          type: "update",
        },
      ]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).not.toHaveBeenCalled();
    });

    it("falls back to scheduleFlush on callback error", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      // null events causes for..of to throw, triggering catch → scheduleFlush
      watcherCallback(null, null as any);
      vi.advanceTimersByTime(100);

      // The catch calls scheduleFlush → flush runs (no pending slugs = no-op)
    });

    it("silently handles subscribe failure", async () => {
      mockSubscribe.mockRejectedValueOnce(new Error("cannot watch"));
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);

      await expect(watcher.start()).resolves.toBeUndefined();
    });

    it("processes multiple events in a single batch", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      await watcher.start();

      watcherCallback(null, [
        {
          path: "/tmp/projects/proj1/iara-scripts.yaml",
          type: "update",
        },
        {
          path: "/tmp/projects/proj2/workspaces/ws1",
          type: "create",
        },
        { path: "/tmp/projects/proj3/.git", type: "create" },
      ]);
      vi.advanceTimersByTime(100);

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
      expect(appState.rescanProject).toHaveBeenCalledWith("proj2");
      expect(appState.rescanProject).toHaveBeenCalledWith("proj3");
    });
  });

  describe("flush()", () => {
    it("calls rescanProject for each pending slug", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      w.pendingProjectSlugs.add("proj1");
      w.pendingProjectSlugs.add("proj2");
      w.flush();

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
      expect(appState.rescanProject).toHaveBeenCalledWith("proj2");
      expect(appState.rescanProject).toHaveBeenCalledTimes(2);
    });

    it("pushes project:changed for each successfully rescanned project", () => {
      const project1 = { slug: "proj1" };
      const project2 = { slug: "proj2" };
      const appState = createMockAppState({
        rescanProject: vi.fn((slug: string) => {
          if (slug === "proj1") return project1;
          if (slug === "proj2") return project2;
          return null;
        }),
      });

      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      w.pendingProjectSlugs.add("proj1");
      w.pendingProjectSlugs.add("proj2");
      w.flush();

      expect(pushFn).toHaveBeenCalledWith("project:changed", {
        project: project1,
      });
      expect(pushFn).toHaveBeenCalledWith("project:changed", {
        project: project2,
      });
      expect(pushFn).toHaveBeenCalledTimes(2);
    });

    it("does full resync when a previously known project is deleted", () => {
      const state = { projects: [], settings: {} };
      const appState = createMockAppState({
        rescanProject: vi.fn().mockReturnValue(null),
        getProject: vi.fn().mockReturnValue({ slug: "deleted" }),
        getState: vi.fn().mockReturnValue(state),
      });

      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      w.pendingProjectSlugs.add("deleted");
      w.flush();

      expect(appState.scan).toHaveBeenCalled();
      expect(pushFn).toHaveBeenCalledWith("state:resync", { state });
    });

    it("skips unknown projects that return null without triggering resync", () => {
      const appState = createMockAppState({
        rescanProject: vi.fn().mockReturnValue(null),
        getProject: vi.fn().mockReturnValue(null),
      });

      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      w.pendingProjectSlugs.add("unknown");
      w.flush();

      expect(appState.scan).not.toHaveBeenCalled();
      expect(pushFn).not.toHaveBeenCalled();
    });

    it("clears pendingProjectSlugs after flush", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      w.pendingProjectSlugs.add("proj");
      w.flush();

      expect(w.pendingProjectSlugs.size).toBe(0);
    });

    it("catches errors and falls back to full resync", () => {
      const state = { projects: [], settings: {} };
      const appState = createMockAppState({
        rescanProject: vi.fn().mockImplementation(() => {
          throw new Error("boom");
        }),
        getState: vi.fn().mockReturnValue(state),
      });

      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      w.pendingProjectSlugs.add("proj");
      w.flush();

      expect(appState.scan).toHaveBeenCalled();
      expect(pushFn).toHaveBeenCalledWith("state:resync", { state });
    });
  });

  describe("suppressNext()", () => {
    it("adds path to ownWrites map", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      watcher.suppressNext("/some/path/file.yaml");
      expect(w.ownWrites.has("/some/path/file.yaml")).toBe(true);
    });

    it("removes path from ownWrites after 1000ms timeout", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      watcher.suppressNext("/some/path");
      expect(w.ownWrites.has("/some/path")).toBe(true);

      vi.advanceTimersByTime(999);
      expect(w.ownWrites.has("/some/path")).toBe(true);

      vi.advanceTimersByTime(1);
      expect(w.ownWrites.has("/some/path")).toBe(false);
    });

    it("replaces existing timer on repeated calls for the same path", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      watcher.suppressNext("/some/path");
      vi.advanceTimersByTime(800);
      expect(w.ownWrites.has("/some/path")).toBe(true);

      // Re-suppress resets the 1000ms timer
      watcher.suppressNext("/some/path");
      vi.advanceTimersByTime(800);
      // 800ms after second call, still present
      expect(w.ownWrites.has("/some/path")).toBe(true);

      vi.advanceTimersByTime(200);
      // 1000ms after second call, now removed
      expect(w.ownWrites.has("/some/path")).toBe(false);
    });
  });

  describe("scheduleFlush()", () => {
    it("debounces flush with 100ms delay", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;
      const flushSpy = vi.spyOn(w, "flush");

      w.pendingProjectSlugs.add("proj");
      w.scheduleFlush();
      w.scheduleFlush();
      w.scheduleFlush();

      expect(flushSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(flushSpy).toHaveBeenCalledTimes(1);
    });

    it("resets debounce timer on each call", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;
      const flushSpy = vi.spyOn(w, "flush");

      w.pendingProjectSlugs.add("proj");
      w.scheduleFlush();

      vi.advanceTimersByTime(80);
      expect(flushSpy).not.toHaveBeenCalled();

      // Calling again resets the 100ms window
      w.scheduleFlush();

      vi.advanceTimersByTime(80);
      expect(flushSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(20);
      expect(flushSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop()", () => {
    it("clears debounce timer", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      w.pendingProjectSlugs.add("proj");
      w.scheduleFlush();
      expect(w.debounceTimer).not.toBeNull();

      watcher.stop();

      // Advancing time should not trigger flush since timer was cleared
      const flushSpy = vi.spyOn(w, "flush");
      vi.advanceTimersByTime(200);
      expect(flushSpy).not.toHaveBeenCalled();
    });

    it("unsubscribes from watcher subscription", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);
      const w = watcher as any;

      const unsubscribe = vi.fn().mockResolvedValue(undefined);
      w.subscription = { unsubscribe };

      await watcher.stop();

      expect(unsubscribe).toHaveBeenCalled();
      expect(w.subscription).toBeNull();
    });

    it("is safe to call when no subscription exists", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);

      await expect(watcher.stop()).resolves.toBeUndefined();
    });

    it("is safe to call multiple times", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/tmp/projects", appState, pushFn);

      await watcher.stop();
      await watcher.stop();
    });
  });
});
