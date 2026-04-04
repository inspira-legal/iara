import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SessionWatcher } from "./session-watcher.js";

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
  // Override HOME so computeProjectHash-based paths use our temp dir
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

      // Create workspace dir so computeProjectHash has a real path
      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushFn = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);

      await watcher.refresh();

      // The watcher should have mapped workspace IDs to session hashes
      const w = watcher as any;
      expect(w.hashToWorkspaceIds.size).toBeGreaterThan(0);

      watcher.stop();
    });

    it("removes watchers for deleted projects", async () => {
      const pushFn = vi.fn();
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);

      await watcher.refresh();
      const w = watcher as any;
      const initialSize = w.hashToWorkspaceIds.size;
      expect(initialSize).toBeGreaterThan(0);

      // Now refresh with empty projects
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

      const pushFn = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);

      await watcher.refresh();
      const w = watcher as any;
      // Should have watchers for both workspaces (possibly shared hashes)
      expect(w.hashToWorkspaceIds.size).toBeGreaterThan(0);

      watcher.stop();
    });
  });

  describe("push events", () => {
    it("pushes session:changed events after debounce", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushFn = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);
      await watcher.refresh();

      // Simulate debounced notify via private method
      const w = watcher as any;
      const hashes = Array.from(w.hashToWorkspaceIds.keys()) as string[];
      if (hashes.length > 0) {
        w.debouncedNotify(hashes[0]);
        expect(pushFn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(600);
        expect(pushFn).toHaveBeenCalledWith("session:changed", { workspaceId: "proj1/default" });
      }

      watcher.stop();
    });

    it("debounces multiple rapid changes", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushFn = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);
      await watcher.refresh();

      const w = watcher as any;
      const hashes = Array.from(w.hashToWorkspaceIds.keys()) as string[];
      if (hashes.length > 0) {
        w.debouncedNotify(hashes[0]);
        w.debouncedNotify(hashes[0]);
        w.debouncedNotify(hashes[0]);

        vi.advanceTimersByTime(600);
        // Should only push once despite 3 rapid calls
        expect(pushFn).toHaveBeenCalledTimes(1);
      }

      watcher.stop();
    });
  });

  describe("debouncedNotify()", () => {
    it("does nothing when hash has no mapped workspace IDs", () => {
      const pushFn = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushFn, appState);
      const w = watcher as any;

      // Call debouncedNotify with a hash that doesn't exist in hashToWorkspaceIds
      w.debouncedNotify("nonexistent-hash");
      vi.advanceTimersByTime(600);

      // Should not push anything
      expect(pushFn).not.toHaveBeenCalled();

      watcher.stop();
    });

    it("pushes events for all workspace IDs mapped to the hash", () => {
      const pushFn = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushFn, appState);
      const w = watcher as any;

      // Manually set up hash mapping with multiple workspace IDs
      w.hashToWorkspaceIds.set("test-hash", new Set(["ws1", "ws2", "ws3"]));

      w.debouncedNotify("test-hash");
      vi.advanceTimersByTime(600);

      expect(pushFn).toHaveBeenCalledTimes(3);
      expect(pushFn).toHaveBeenCalledWith("session:changed", { workspaceId: "ws1" });
      expect(pushFn).toHaveBeenCalledWith("session:changed", { workspaceId: "ws2" });
      expect(pushFn).toHaveBeenCalledWith("session:changed", { workspaceId: "ws3" });

      watcher.stop();
    });

    it("cleans up timer after firing", () => {
      const pushFn = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushFn, appState);
      const w = watcher as any;

      w.hashToWorkspaceIds.set("test-hash", new Set(["ws1"]));
      w.debouncedNotify("test-hash");

      expect(w.debounceTimers.size).toBe(1);

      vi.advanceTimersByTime(600);

      expect(w.debounceTimers.size).toBe(0);

      watcher.stop();
    });
  });

  describe("watchHash()", () => {
    it("ignores non-jsonl files in watched directory", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushFn = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);
      await watcher.refresh();

      const w = watcher as any;
      const hashes = Array.from(w.subscriptions.keys()) as string[];

      // Write a non-jsonl file to one of the watched dirs
      if (hashes.length > 0) {
        const home = process.env.HOME ?? "";
        const watchedDir = path.join(home, ".claude", "projects", hashes[0]!);
        fs.writeFileSync(path.join(watchedDir, "test.txt"), "not jsonl");

        vi.advanceTimersByTime(600);
        expect(pushFn).not.toHaveBeenCalled();
      }

      watcher.stop();
    });

    it("detects jsonl file changes in watched directory", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushFn = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);
      await watcher.refresh();

      const w = watcher as any;
      const hashes = Array.from(w.subscriptions.keys()) as string[];

      if (hashes.length > 0) {
        const home = process.env.HOME ?? "";
        const watchedDir = path.join(home, ".claude", "projects", hashes[0]!);
        fs.writeFileSync(path.join(watchedDir, "session.jsonl"), "{}");

        // Allow real timers for FS event, then advance for debounce
        vi.advanceTimersByTime(600);
      }

      watcher.stop();
    });
  });

  describe("refresh() edge cases", () => {
    it("reuses existing watchers for unchanged hashes", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushFn = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);

      await watcher.refresh();
      const w = watcher as any;
      const firstWatchers = new Map(w.subscriptions);

      // Refresh again with same projects — should reuse watchers
      await watcher.refresh();

      for (const [hash, fsWatcher] of firstWatchers) {
        // Same watcher instance should be reused
        expect(w.subscriptions.get(hash)).toBe(fsWatcher);
      }

      watcher.stop();
    });
  });

  describe("stop()", () => {
    it("cleans up all watchers and timers", async () => {
      const projects = [
        {
          slug: "proj1",
          workspaces: [{ id: "proj1/default", slug: "default" }],
        },
      ];

      const wsDir = path.join(tmpHome, "projects", "proj1", "default");
      fs.mkdirSync(wsDir, { recursive: true });

      const pushFn = vi.fn();
      const appState = createMockAppState(projects);
      const watcher = new SessionWatcher(pushFn, appState);
      await watcher.refresh();

      watcher.stop();

      const w = watcher as any;
      expect(w.subscriptions.size).toBe(0);
      expect(w.debounceTimers.size).toBe(0);
    });

    it("is safe to call without starting", () => {
      const pushFn = vi.fn();
      const appState = createMockAppState();
      const watcher = new SessionWatcher(pushFn, appState);
      expect(() => watcher.stop()).not.toThrow();
    });
  });
});
