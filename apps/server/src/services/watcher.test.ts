import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectsDirWatcher } from "./projects-dir-watcher.js";

function createMockAppState(overrides: Record<string, unknown> = {}) {
  return {
    rescanProject: vi.fn().mockReturnValue({ slug: "proj" }),
    scan: vi.fn(),
    getState: vi.fn().mockReturnValue({ projects: [], settings: {} }),
    getProject: vi.fn().mockReturnValue({ slug: "proj" }),
    discoverRepos: vi.fn().mockReturnValue([]),
    getWorkspaceDir: vi.fn().mockReturnValue("/tmp/ws"),
    ...overrides,
  } as any;
}

describe("ProjectsDirWatcher", () => {
  let tmpDir: string;
  // biome-ignore lint: test mock
  let pushPatch: any;

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watcher-test-"));
    pushPatch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("start()", () => {
    it("creates a watcher without throwing", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      await expect(watcher.start()).resolves.not.toThrow();
      watcher.stop();
    });

    it("does not throw when directory does not exist", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher("/nonexistent/path", appState, pushPatch);
      await expect(watcher.start()).resolves.not.toThrow();
      watcher.stop();
    });
  });

  describe("suppressWrite()", () => {
    it("suppresses a path so watcher ignores env.toml writes", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      watcher.suppressWrite("/some/workspace");
      expect(w.suppressedPaths.has("/some/workspace/env.toml")).toBe(true);
    });

    it("clears suppression after 1 second", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      watcher.suppressWrite("/some/workspace");
      expect(w.suppressedPaths.has("/some/workspace/env.toml")).toBe(true);

      vi.advanceTimersByTime(1100);
      expect(w.suppressedPaths.has("/some/workspace/env.toml")).toBe(false);
    });

    it("resets timer on repeated suppressions", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      watcher.suppressWrite("/some/workspace");
      vi.advanceTimersByTime(800);
      expect(w.suppressedPaths.has("/some/workspace/env.toml")).toBe(true);

      watcher.suppressWrite("/some/workspace");
      vi.advanceTimersByTime(800);
      expect(w.suppressedPaths.has("/some/workspace/env.toml")).toBe(true);

      vi.advanceTimersByTime(300);
      expect(w.suppressedPaths.has("/some/workspace/env.toml")).toBe(false);
    });
  });

  describe("flushProjects()", () => {
    it("collects unique project slugs and rescans", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      w.flushProjects(new Set(["proj1", "proj2"]));

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
      expect(appState.rescanProject).toHaveBeenCalledWith("proj2");
      expect(appState.rescanProject).toHaveBeenCalledTimes(2);
    });

    it("pushes projects patch after rescanning", () => {
      const project1 = { slug: "proj1" };
      const project2 = { slug: "proj2" };
      const projects = [project1, project2];
      const appState = createMockAppState({
        rescanProject: vi.fn((slug: string) => {
          if (slug === "proj1") return project1;
          if (slug === "proj2") return project2;
          return null;
        }),
        getState: vi.fn().mockReturnValue({ projects, settings: {} }),
      });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      w.flushProjects(new Set(["proj1", "proj2"]));

      expect(pushPatch).toHaveBeenCalledWith({ projects });
    });

    it("does full resync when a previously known project disappears", () => {
      const state = { projects: [], settings: {} };
      const appState = createMockAppState({
        rescanProject: vi.fn().mockReturnValue(null),
        getProject: vi.fn().mockReturnValue({ slug: "deleted" }),
        getState: vi.fn().mockReturnValue(state),
      });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      w.flushProjects(new Set(["deleted"]));

      expect(appState.scan).toHaveBeenCalled();
      expect(pushPatch).toHaveBeenCalledWith({ projects: [] });
    });

    it("catches errors and does full resync", () => {
      const state = { projects: [], settings: {} };
      const appState = createMockAppState({
        rescanProject: vi.fn().mockImplementation(() => {
          throw new Error("boom");
        }),
        getState: vi.fn().mockReturnValue(state),
      });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      w.flushProjects(new Set(["proj"]));

      expect(appState.scan).toHaveBeenCalled();
      expect(pushPatch).toHaveBeenCalledWith({ projects: [] });
    });
  });

  describe("flushEnv()", () => {
    it("generates .env files for affected workspaces", () => {
      const project = {
        slug: "proj",
        workspaces: [{ id: "proj/main", slug: "main" }],
      };
      const appState = createMockAppState({
        getProject: vi.fn().mockReturnValue(project),
        discoverRepos: vi.fn().mockReturnValue(["repo1"]),
        getWorkspaceDir: vi.fn().mockReturnValue("/tmp/ws"),
      });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      w.flushEnv(new Set(["proj"]));

      expect(appState.getProject).toHaveBeenCalledWith("proj");
      expect(appState.discoverRepos).toHaveBeenCalledWith("proj");
    });

    it("skips projects with no repos", () => {
      const project = {
        slug: "proj",
        workspaces: [{ id: "proj/main", slug: "main" }],
      };
      const appState = createMockAppState({
        getProject: vi.fn().mockReturnValue(project),
        discoverRepos: vi.fn().mockReturnValue([]),
      });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      w.flushEnv(new Set(["proj"]));

      expect(appState.getWorkspaceDir).not.toHaveBeenCalled();
    });

    it("skips unknown projects", () => {
      const appState = createMockAppState({
        getProject: vi.fn().mockReturnValue(null),
      });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      w.flushEnv(new Set(["unknown"]));

      expect(appState.discoverRepos).not.toHaveBeenCalled();
    });
  });

  describe("stop()", () => {
    it("cleans up watcher and debounces", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      await watcher.start();
      expect(() => watcher.stop()).not.toThrow();
    });

    it("is safe to call multiple times", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      watcher.stop();
      watcher.stop();
    });
  });

  describe("start()/stop() lifecycle", () => {
    it("can be restarted after stop", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      await watcher.start();
      watcher.stop();
      await watcher.start();
      watcher.stop();
    });
  });

  describe("flush() - rescanProject returns null for unknown project", () => {
    it("skips projects that return null from rescanProject", () => {
      const appState = createMockAppState({
        rescanProject: vi.fn().mockReturnValue(null),
        getProject: vi.fn().mockReturnValue(null),
      });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, pushPatch);
      const w = watcher as any;

      w.flushProjects(new Set(["unknown"]));

      expect(appState.scan).not.toHaveBeenCalled();
      expect(pushPatch).toHaveBeenCalledWith({ projects: [] });
    });
  });
});
