import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let shallowWatcherOnChange:
  | ((watchedPath: string, eventType: string, filename: string | null) => void)
  | null = null;
let shallowWatcherOnError: ((watchedPath: string, error: Error) => void) | null = null;
const mockAdd = vi.fn();
const mockStop = vi.fn();

vi.mock("@iara/shared/shallow-watcher", () => {
  return {
    ShallowWatcher: class MockShallowWatcher {
      constructor(opts: any) {
        shallowWatcherOnChange = opts.onChange;
        shallowWatcherOnError = opts.onError;
      }
      add = mockAdd;
      stop = mockStop;
    },
  };
});

vi.mock("@iara/shared/timing", () => ({
  createKeyedDebounce: vi
    .fn()
    .mockImplementation((_delay: number, flush: (keys: Set<string>) => void) => ({
      schedule: vi.fn((key: string) => flush(new Set([key]))),
      cancelAll: vi.fn(),
    })),
}));

vi.mock("./env.js", () => ({
  generateDotEnvFiles: vi.fn(),
  readEnvToml: vi.fn().mockReturnValue({ raw: "", vars: {} }),
}));

import { generateDotEnvFiles, readEnvToml } from "./env.js";
import { ProjectsDirWatcher } from "./projects-dir-watcher.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function createMockAppState(projects: any[] = []) {
  return {
    getState: vi.fn(() => ({ projects })),
    getProject: vi.fn((slug: string) => projects.find((p: any) => p.slug === slug) ?? null),
    rescanProject: vi.fn((slug: string) => projects.find((p: any) => p.slug === slug) ?? null),
    scan: vi.fn(),
    discoverRepos: vi.fn(() => ["repo1"]),
    getWorkspaceDir: vi.fn((wsId: string) => {
      const [slug, ws] = wsId.split("/");
      if (ws === "main") return path.join(tmpDir, slug!);
      return path.join(tmpDir, slug!, "workspaces", ws!);
    }),
  } as any;
}

const mockPushPatch = vi.fn();

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdw-test-"));
  vi.clearAllMocks();
  shallowWatcherOnChange = null;
  shallowWatcherOnError = null;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProjectsDirWatcher", () => {
  describe("start()", () => {
    it("creates a ShallowWatcher and adds projectsDir", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);

      await watcher.start();

      expect(mockAdd).toHaveBeenCalledWith(tmpDir);
    });

    it("watches project subdirectories", async () => {
      fs.mkdirSync(path.join(tmpDir, "proj1"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "proj1", ".git"), { recursive: true });

      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);

      await watcher.start();

      expect(mockAdd).toHaveBeenCalledWith(path.join(tmpDir, "proj1"));
    });

    it("watches workspaces directories", async () => {
      fs.mkdirSync(path.join(tmpDir, "proj1", "workspaces", "ws1"), { recursive: true });

      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);

      await watcher.start();

      expect(mockAdd).toHaveBeenCalledWith(path.join(tmpDir, "proj1", "workspaces"));
      expect(mockAdd).toHaveBeenCalledWith(path.join(tmpDir, "proj1", "workspaces", "ws1"));
    });

    it("generates dotenv files for all workspaces on start", async () => {
      const projects = [{ slug: "proj1", workspaces: [{ id: "proj1/main", slug: "main" }] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);

      await watcher.start();

      expect(generateDotEnvFiles).toHaveBeenCalled();
    });
  });

  describe("stop()", () => {
    it("stops the ShallowWatcher and clears debounces", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      watcher.stop();

      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe("handleChange — project root level", () => {
    it("rescans project when a new directory appears", async () => {
      const projects = [{ slug: "proj1", workspaces: [] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      // Create the directory so stat succeeds
      fs.mkdirSync(path.join(tmpDir, "newproj"), { recursive: true });

      // Simulate change at projectsDir level
      shallowWatcherOnChange!(tmpDir, "rename", "newproj");

      expect(appState.rescanProject).toHaveBeenCalledWith("newproj");
      expect(mockPushPatch).toHaveBeenCalledWith({ projects: projects });
    });
  });

  describe("handleChange — project-level events", () => {
    it("rescans on iara-scripts.yaml change", async () => {
      const projDir = path.join(tmpDir, "proj1");
      fs.mkdirSync(projDir, { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      shallowWatcherOnChange!(projDir, "change", "iara-scripts.yaml");

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
    });

    it("rescans on .git change", async () => {
      const projDir = path.join(tmpDir, "proj1");
      fs.mkdirSync(projDir, { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      shallowWatcherOnChange!(projDir, "rename", ".git");

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
    });

    it("schedules env debounce on env.toml change", async () => {
      const projDir = path.join(tmpDir, "proj1");
      fs.mkdirSync(projDir, { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [{ id: "proj1/main", slug: "main" }] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      shallowWatcherOnChange!(projDir, "change", "env.toml");

      expect(generateDotEnvFiles).toHaveBeenCalled();
      expect(readEnvToml).toHaveBeenCalled();
      expect(mockPushPatch).toHaveBeenCalledWith({ env: expect.any(Object) });
    });

    it("rescans on new directory (potential repo)", async () => {
      const projDir = path.join(tmpDir, "proj1");
      fs.mkdirSync(path.join(projDir, "newrepo"), { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      shallowWatcherOnChange!(projDir, "rename", "newrepo");

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
    });
  });

  describe("handleChange — workspaces level", () => {
    it("rescans project when workspace added/removed", async () => {
      const wsDir = path.join(tmpDir, "proj1", "workspaces");
      fs.mkdirSync(path.join(wsDir, "ws1"), { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      shallowWatcherOnChange!(wsDir, "rename", "ws1");

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
      // Should also try to watch the new workspace dir
      expect(mockAdd).toHaveBeenCalledWith(path.join(wsDir, "ws1"));
    });
  });

  describe("handleChange — workspace env.toml", () => {
    it("pushes env patch on workspace env.toml change", async () => {
      const wsDir = path.join(tmpDir, "proj1", "workspaces", "ws1");
      fs.mkdirSync(wsDir, { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [{ id: "proj1/ws1", slug: "ws1" }] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      shallowWatcherOnChange!(wsDir, "change", "env.toml");

      expect(generateDotEnvFiles).toHaveBeenCalled();
      expect(mockPushPatch).toHaveBeenCalledWith({ env: expect.any(Object) });
    });

    it("ignores non-env.toml files in workspace dir", async () => {
      const wsDir = path.join(tmpDir, "proj1", "workspaces", "ws1");
      fs.mkdirSync(wsDir, { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [{ id: "proj1/ws1", slug: "ws1" }] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      vi.clearAllMocks();
      shallowWatcherOnChange!(wsDir, "change", "other-file.txt");

      expect(generateDotEnvFiles).not.toHaveBeenCalled();
      expect(mockPushPatch).not.toHaveBeenCalled();
    });
  });

  describe("suppressWrite()", () => {
    it("suppresses env.toml change when recently written", async () => {
      const projDir = path.join(tmpDir, "proj1");
      fs.mkdirSync(projDir, { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [{ id: "proj1/main", slug: "main" }] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();
      vi.clearAllMocks();

      watcher.suppressWrite(projDir);
      shallowWatcherOnChange!(projDir, "change", "env.toml");

      // Should be suppressed — no env push
      expect(generateDotEnvFiles).not.toHaveBeenCalled();
      expect(mockPushPatch).not.toHaveBeenCalled();
    });
  });

  describe("handleChange — null filename", () => {
    it("ignores events with null filename", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();
      vi.clearAllMocks();

      shallowWatcherOnChange!(tmpDir, "change", null);

      expect(appState.rescanProject).not.toHaveBeenCalled();
      expect(mockPushPatch).not.toHaveBeenCalled();
    });
  });

  describe("onError callback", () => {
    it("rescans project when a watched directory is deleted", async () => {
      const projDir = path.join(tmpDir, "proj1");
      fs.mkdirSync(projDir, { recursive: true });

      const projects = [{ slug: "proj1", workspaces: [] }];
      const appState = createMockAppState(projects);
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      shallowWatcherOnError!(projDir, new Error("ENOENT"));

      expect(appState.rescanProject).toHaveBeenCalledWith("proj1");
    });

    it("ignores error for projectsDir itself", async () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();
      vi.clearAllMocks();

      shallowWatcherOnError!(tmpDir, new Error("ENOENT"));

      expect(appState.rescanProject).not.toHaveBeenCalled();
    });
  });

  describe("flushProjects()", () => {
    it("triggers full scan when a known project disappears", async () => {
      const projects = [{ slug: "proj1", workspaces: [] }];
      const appState = createMockAppState(projects);
      // rescanProject returns null for this slug (project deleted)
      appState.rescanProject.mockReturnValue(null);
      appState.getProject.mockReturnValue({ slug: "proj1" }); // was previously known

      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();

      // Trigger handleChange for projectsDir level
      shallowWatcherOnChange!(tmpDir, "rename", "proj1");

      expect(appState.scan).toHaveBeenCalled();
    });
  });

  describe("flushEnv()", () => {
    it("skips projects with no repos", async () => {
      const projects = [{ slug: "proj1", workspaces: [{ id: "proj1/main", slug: "main" }] }];
      const appState = createMockAppState(projects);
      appState.discoverRepos.mockReturnValue([]);

      const projDir = path.join(tmpDir, "proj1");
      fs.mkdirSync(projDir, { recursive: true });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();
      vi.clearAllMocks();

      shallowWatcherOnChange!(projDir, "change", "env.toml");

      expect(generateDotEnvFiles).not.toHaveBeenCalled();
      expect(mockPushPatch).not.toHaveBeenCalled();
    });

    it("skips unknown projects", async () => {
      const appState = createMockAppState([]);
      const projDir = path.join(tmpDir, "unknown");
      fs.mkdirSync(projDir, { recursive: true });

      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();
      vi.clearAllMocks();

      shallowWatcherOnChange!(projDir, "change", "env.toml");

      expect(generateDotEnvFiles).not.toHaveBeenCalled();
      expect(mockPushPatch).not.toHaveBeenCalled();
    });
  });

  describe("refresh()", () => {
    it("re-adds watch paths", async () => {
      fs.mkdirSync(path.join(tmpDir, "proj1"), { recursive: true });
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);
      await watcher.start();
      vi.clearAllMocks();

      // Add a new project dir before refresh
      fs.mkdirSync(path.join(tmpDir, "proj2"), { recursive: true });
      watcher.refresh();

      expect(mockAdd).toHaveBeenCalledWith(path.join(tmpDir, "proj2"));
    });

    it("does nothing if not started", () => {
      const appState = createMockAppState();
      const watcher = new ProjectsDirWatcher(tmpDir, appState, mockPushPatch);

      // Should not throw
      watcher.refresh();
      expect(mockAdd).not.toHaveBeenCalled();
    });
  });
});
