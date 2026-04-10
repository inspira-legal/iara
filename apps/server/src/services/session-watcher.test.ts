import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SessionWatcher } from "./session-watcher.js";

vi.mock("./sessions.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./sessions.js")>();
  return {
    ...mod,
    listSessions: vi.fn().mockResolvedValue([]),
  };
});

let tmpHome: string;

function createMockAppState(
  projects: Array<{
    slug: string;
    workspaces: Array<{ id: string; slug: string }>;
  }> = [],
) {
  return {
    getState: vi.fn().mockReturnValue({ projects }),
    getProjectDir: vi.fn((slug: string) => path.join(tmpHome, "projects", slug)),
    getWorkspaceDir: vi.fn((wsId: string) => {
      const [pSlug, wsSlug] = wsId.split("/") as [string, string];
      return path.join(tmpHome, "projects", pSlug, wsSlug);
    }),
  } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "session-watcher-test-"));
  process.env.HOME = tmpHome;
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("SessionWatcher", () => {
  describe("refresh()", () => {
    it("creates watchers for workspace session directories", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushPatch = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushPatch, appState);

      await watcher.refresh();

      const w = watcher as any;
      expect(w.hashToWorkspaceIds.size).toBeGreaterThan(0);
      expect(w.watcher.size).toBeGreaterThan(0);

      watcher.stop();
    });

    it("removes watchers for deleted projects", async () => {
      const pushPatch = vi.fn();
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushPatch, appState);

      await watcher.refresh();
      const w = watcher as any;
      expect(w.hashToWorkspaceIds.size).toBeGreaterThan(0);

      appState.getState.mockReturnValue({ projects: [] });
      await watcher.refresh();

      expect(w.hashToWorkspaceIds.size).toBe(0);
      watcher.stop();
    });

    it("handles projects with multiple workspaces", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [
            { id: "proj1/default", slug: "default" },
            { id: "proj1/feature", slug: "feature" },
          ],
        },
      ];

      const wsDir1 = path.join(tmpHome, "projects", "proj1", "default");
      const wsDir2 = path.join(tmpHome, "projects", "proj1", "feature");
      fs.mkdirSync(wsDir1, { recursive: true });
      fs.mkdirSync(wsDir2, { recursive: true });

      const pushPatch = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushPatch, appState);

      await watcher.refresh();
      const w = watcher as any;
      expect(w.hashToWorkspaceIds.size).toBeGreaterThan(0);

      watcher.stop();
    });

    it("reuses existing watchers for unchanged hashes", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushPatch = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushPatch, appState);

      await watcher.refresh();
      const w = watcher as any;
      const sizeBefore = w.watcher.size;

      await watcher.refresh();
      expect(w.watcher.size).toBe(sizeBefore);

      watcher.stop();
    });
  });

  describe("flushHashes()", () => {
    it("pushes sessions patch for all workspace IDs mapped to the hash", async () => {
      const pushPatch = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushPatch, appState);
      const w = watcher as any;

      w.hashToWorkspaceIds.set("test-hash", new Set(["p/ws1", "p/ws2", "p/ws3"]));

      w.flushHashes(new Set(["test-hash"]));
      await vi.advanceTimersByTimeAsync(100);

      expect(pushPatch).toHaveBeenCalledTimes(1);
      expect(pushPatch).toHaveBeenCalledWith({
        sessions: { "p/ws1": [], "p/ws2": [], "p/ws3": [] },
      });

      watcher.stop();
    });

    it("does nothing when hash has no mapped workspace IDs", async () => {
      const pushPatch = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushPatch, appState);
      const w = watcher as any;

      w.flushHashes(new Set(["nonexistent-hash"]));
      await vi.advanceTimersByTimeAsync(100);

      expect(pushPatch).not.toHaveBeenCalled();

      watcher.stop();
    });
  });

  describe("debounce", () => {
    it("schedules and fires after debounce period", async () => {
      const pushPatch = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushPatch, appState);
      const w = watcher as any;

      w.hashToWorkspaceIds.set("test-hash", new Set(["p/ws1"]));
      w.debounce.schedule("test-hash");

      expect(pushPatch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2100);

      expect(pushPatch).toHaveBeenCalledWith({ sessions: { "p/ws1": [] } });

      watcher.stop();
    });

    it("debounces multiple rapid changes", async () => {
      const pushPatch = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushPatch, appState);
      const w = watcher as any;

      w.hashToWorkspaceIds.set("test-hash", new Set(["p/ws1"]));
      w.debounce.schedule("test-hash");
      w.debounce.schedule("test-hash");
      w.debounce.schedule("test-hash");

      await vi.advanceTimersByTimeAsync(2100);

      expect(pushPatch).toHaveBeenCalledTimes(1);

      watcher.stop();
    });
  });

  describe("stop()", () => {
    it("cleans up all watchers", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushPatch = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushPatch, appState);
      await watcher.refresh();

      watcher.stop();

      const w = watcher as any;
      expect(w.watcher.size).toBe(0);
    });

    it("is safe to call without starting", () => {
      const pushPatch = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushPatch, appState);
      expect(() => watcher.stop()).not.toThrow();
    });
  });
});
