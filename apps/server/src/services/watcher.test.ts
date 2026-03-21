import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectsWatcher } from "./watcher.js";

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
  let tmpDir: string;
  // biome-ignore lint: test mock
  let pushFn: any;

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watcher-test-"));
    pushFn = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("start()", () => {
    it("creates a watcher without throwing", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      expect(() => watcher.start()).not.toThrow();
      watcher.stop();
    });

    it("does not throw when directory does not exist", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher("/nonexistent/path", appState, pushFn);
      expect(() => watcher.start()).not.toThrow();
    });
  });

  describe("suppressNext()", () => {
    it("suppresses a path so watcher ignores own writes", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);

      // Access private ownWrites via any
      const w = watcher as any;
      watcher.suppressNext("/some/path/project.json");
      expect(w.ownWrites.has("/some/path/project.json")).toBe(true);
    });

    it("clears suppression after 1 second", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      const w = watcher as any;

      watcher.suppressNext("/some/path");
      expect(w.ownWrites.has("/some/path")).toBe(true);

      vi.advanceTimersByTime(1100);
      expect(w.ownWrites.has("/some/path")).toBe(false);
    });

    it("resets timer on repeated suppressions", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      const w = watcher as any;

      watcher.suppressNext("/some/path");
      vi.advanceTimersByTime(800);
      // Still present
      expect(w.ownWrites.has("/some/path")).toBe(true);

      // Re-suppress resets the timer
      watcher.suppressNext("/some/path");
      vi.advanceTimersByTime(800);
      // Should still be present (800ms after second suppress)
      expect(w.ownWrites.has("/some/path")).toBe(true);

      vi.advanceTimersByTime(300);
      // Now 1100ms after second suppress
      expect(w.ownWrites.has("/some/path")).toBe(false);
    });
  });

  describe("flush()", () => {
    it("collects unique project slugs and rescans", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      const w = watcher as any;

      // Simulate pending changes
      w.pendingChanges.set(`proj1${path.sep}project.json`, "project");
      w.pendingChanges.set(`proj1${path.sep}ws1${path.sep}workspace.json`, "workspace");
      w.pendingChanges.set(`proj2${path.sep}project.json`, "project");

      w.flush();

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
      expect(appState.rescanProject).toHaveBeenCalledWith("proj2");
      expect(appState.rescanProject).toHaveBeenCalledTimes(2);
    });

    it("pushes project:changed events for each project", () => {
      const project1 = { slug: "proj1" };
      const project2 = { slug: "proj2" };
      const appState = createMockAppState({
        rescanProject: vi.fn().mockReturnValue({}),
        getProject: vi.fn((slug: string) => {
          if (slug === "proj1") return project1;
          if (slug === "proj2") return project2;
          return null;
        }),
      });

      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      const w = watcher as any;

      w.pendingChanges.set(`proj1${path.sep}project.json`, "project");
      w.pendingChanges.set(`proj2${path.sep}project.json`, "project");
      w.flush();

      expect(pushFn).toHaveBeenCalledWith("project:changed", { project: project1 });
      expect(pushFn).toHaveBeenCalledWith("project:changed", { project: project2 });
    });

    it("does full resync when rescanProject returns null", () => {
      const state = { projects: [], settings: {} };
      const appState = createMockAppState({
        rescanProject: vi.fn().mockReturnValue(null),
        getState: vi.fn().mockReturnValue(state),
      });

      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      const w = watcher as any;

      w.pendingChanges.set(`deleted${path.sep}project.json`, "project");
      w.flush();

      expect(appState.scan).toHaveBeenCalled();
      expect(pushFn).toHaveBeenCalledWith("state:resync", { state });
    });

    it("clears pending changes after flush", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      const w = watcher as any;

      w.pendingChanges.set(`proj${path.sep}project.json`, "project");
      w.flush();

      expect(w.pendingChanges.size).toBe(0);
    });

    it("catches errors and does full resync", () => {
      const state = { projects: [], settings: {} };
      const appState = createMockAppState({
        rescanProject: vi.fn().mockImplementation(() => {
          throw new Error("boom");
        }),
        getState: vi.fn().mockReturnValue(state),
      });

      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      const w = watcher as any;

      w.pendingChanges.set(`proj${path.sep}project.json`, "project");
      w.flush();

      expect(appState.scan).toHaveBeenCalled();
      expect(pushFn).toHaveBeenCalledWith("state:resync", { state });
    });
  });

  describe("scheduleFlush()", () => {
    it("debounces flush calls to 100ms", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      const w = watcher as any;
      const flushSpy = vi.spyOn(w, "flush");

      w.pendingChanges.set(`proj${path.sep}project.json`, "project");
      w.scheduleFlush();
      w.scheduleFlush();
      w.scheduleFlush();

      expect(flushSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(flushSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop()", () => {
    it("cleans up watcher and timers", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      watcher.start();
      expect(() => watcher.stop()).not.toThrow();
    });

    it("is safe to call multiple times", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsWatcher(tmpDir, appState, pushFn);
      watcher.stop();
      watcher.stop();
    });
  });
});
