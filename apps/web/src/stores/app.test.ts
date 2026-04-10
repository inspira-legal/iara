import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Project, Workspace } from "@iara/contracts";

// ---------------------------------------------------------------------------
// Transport mock
// ---------------------------------------------------------------------------

const {
  mockRequest,
  mockSubscribe,
  mockTerminalDestroy,
  mockTerminalEntries,
  mockScriptsGetState,
  mockScriptsSetState,
} = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockSubscribe: vi.fn((_event: string, _cb: (...args: unknown[]) => void) => vi.fn()),
  mockTerminalDestroy: vi.fn().mockResolvedValue(undefined),
  mockTerminalEntries: { current: new Map() },
  mockScriptsGetState: vi.fn(() => ({ currentWorkspaceId: null as string | null })),
  mockScriptsSetState: vi.fn(),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
  },
}));

vi.mock("./activeSession.js", () => ({
  useActiveSessionStore: {
    getState: () => ({
      entries: mockTerminalEntries.current,
      destroy: mockTerminalDestroy,
    }),
  },
}));

vi.mock("./scripts.js", () => ({
  useScriptsStore: {
    getState: mockScriptsGetState,
    setState: mockScriptsSetState,
  },
}));

import { useAppStore } from "./app";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "proj1/ws1",
    projectId: "proj1",
    slug: "ws1",
    name: "Workspace 1",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj1",
    slug: "proj1",
    name: "Project 1",
    workspaces: [makeWorkspace()],
    ...overrides,
  };
}

const INITIAL_STATE = {
  projects: [],
  settings: {},
  repoInfo: {},
  sessions: {},
  env: {},
  scripts: {},
  scriptStatuses: {},
  appInfo: null,
  selectedWorkspaceId: null,
  initialized: false,
};

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }
  }),
  get length() {
    return Object.keys(localStorageStore).length;
  },
  key: vi.fn((index: number) => Object.keys(localStorageStore)[index] ?? null),
};

vi.stubGlobal("localStorage", localStorageMock);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  useAppStore.setState(INITIAL_STATE);
});

afterEach(() => {
  localStorageMock.clear();
});

describe("useAppStore", () => {
  // -----------------------------------------------------------------------
  // init
  // -----------------------------------------------------------------------

  describe("init()", () => {
    it("calls transport.request('state.init') and sets state", async () => {
      const projects = [makeProject()];
      const settings = { theme: "dark" };
      mockRequest.mockResolvedValueOnce({
        projects,
        settings,
        repoInfo: {},
        sessions: {},
        env: {},
        scripts: {},
        scriptStatuses: {},
        appInfo: { version: "0.0.1", platform: "linux", isDev: true },
        capabilities: { claude: true, platform: "linux" },
      });

      await useAppStore.getState().init();

      expect(mockRequest).toHaveBeenCalledWith("state.init", {});
      const state = useAppStore.getState();
      expect(state.projects).toEqual(projects);
      expect(state.settings).toEqual(settings);
      expect(state.initialized).toBe(true);
    });

    it("propagates transport errors", async () => {
      mockRequest.mockRejectedValueOnce(new Error("network"));
      await expect(useAppStore.getState().init()).rejects.toThrow("network");
      expect(useAppStore.getState().initialized).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // selectWorkspace
  // -----------------------------------------------------------------------

  describe("selectWorkspace()", () => {
    it("null clears workspace selection", () => {
      useAppStore.setState({ selectedWorkspaceId: "proj1/ws1" });
      useAppStore.getState().selectWorkspace(null);
      expect(useAppStore.getState().selectedWorkspaceId).toBeNull();
    });

    it("sets workspace id", () => {
      const proj = makeProject({ id: "proj1", workspaces: [makeWorkspace({ id: "proj1/ws1" })] });
      useAppStore.setState({ projects: [proj] });

      useAppStore.getState().selectWorkspace("proj1/ws1");
      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/ws1");
    });

    it("sets workspace even if not found in any project", () => {
      useAppStore.setState({ projects: [] });
      useAppStore.getState().selectWorkspace("unknown/ws");
      expect(useAppStore.getState().selectedWorkspaceId).toBe("unknown/ws");
    });
  });

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  // createProject
  // -----------------------------------------------------------------------

  describe("createProject()", () => {
    it("calls transport and returns the project", async () => {
      const newProject = makeProject({ id: "new-proj" });
      mockRequest.mockResolvedValueOnce(newProject);

      const result = await useAppStore.getState().createProject({
        slug: "new-proj",
        name: "New Project",
        repoSources: [],
      });

      expect(mockRequest).toHaveBeenCalledWith("projects.create", {
        slug: "new-proj",
        name: "New Project",
        repoSources: [],
      });
      expect(result).toEqual(newProject);
    });
  });

  // -----------------------------------------------------------------------
  // deleteProject
  // -----------------------------------------------------------------------

  describe("deleteProject()", () => {
    it("optimistically removes the project from state", async () => {
      const proj = makeProject({ id: "proj1" });
      useAppStore.setState({ projects: [proj] });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteProject("proj1");

      expect(useAppStore.getState().projects).toHaveLength(0);
      expect(mockRequest).toHaveBeenCalledWith("projects.delete", { id: "proj1" });
    });

    it("clears selection if the deleted project was selected", async () => {
      const proj = makeProject({ id: "proj1" });
      useAppStore.setState({
        projects: [proj],
        selectedWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteProject("proj1");

      expect(useAppStore.getState().selectedWorkspaceId).toBeNull();
    });

    it("does not clear selection if a different project was deleted", async () => {
      const proj1 = makeProject({ id: "proj1" });
      const proj2 = makeProject({ id: "proj2", workspaces: [] });
      useAppStore.setState({
        projects: [proj1, proj2],
        selectedWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteProject("proj2");

      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/ws1");
      expect(useAppStore.getState().projects).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // deleteWorkspace
  // -----------------------------------------------------------------------

  describe("deleteWorkspace()", () => {
    it("optimistically removes workspace from its project", async () => {
      const ws1 = makeWorkspace({ id: "proj1/ws1" });
      const ws2 = makeWorkspace({ id: "proj1/ws2" });
      const proj = makeProject({ id: "proj1", workspaces: [ws1, ws2] });
      useAppStore.setState({ projects: [proj] });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteWorkspace("proj1/ws1");

      expect(useAppStore.getState().projects[0]!.workspaces).toHaveLength(1);
      expect(useAppStore.getState().projects[0]!.workspaces[0]!.id).toBe("proj1/ws2");
    });

    it("clears workspace selection if the deleted workspace was selected", async () => {
      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({
        projects: [proj],
        selectedWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteWorkspace("proj1/ws1");

      expect(useAppStore.getState().selectedWorkspaceId).toBeNull();
    });

    it("does not clear workspace selection if a different workspace was deleted", async () => {
      const ws1 = makeWorkspace({ id: "proj1/ws1" });
      const ws2 = makeWorkspace({ id: "proj1/ws2" });
      const proj = makeProject({ id: "proj1", workspaces: [ws1, ws2] });
      useAppStore.setState({
        projects: [proj],
        selectedWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteWorkspace("proj1/ws2");

      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/ws1");
    });
  });

  // -----------------------------------------------------------------------
  // updateSetting
  // -----------------------------------------------------------------------

  describe("updateSetting()", () => {
    it("adds a new setting key optimistically", async () => {
      useAppStore.setState({ settings: {} });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().updateSetting("newKey", "newValue");

      expect(useAppStore.getState().settings.newKey).toBe("newValue");
    });
  });

  // -----------------------------------------------------------------------
  // Selectors
  // -----------------------------------------------------------------------

  describe("getProject()", () => {
    it("returns the project by id", () => {
      const proj = makeProject({ id: "proj1" });
      useAppStore.setState({ projects: [proj] });
      expect(useAppStore.getState().getProject("proj1")).toEqual(proj);
    });

    it("returns undefined for unknown id", () => {
      expect(useAppStore.getState().getProject("nonexistent")).toBeUndefined();
    });
  });

  describe("getWorkspace()", () => {
    it("finds workspace by parsing projectId from id", () => {
      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({ projects: [proj] });
      expect(useAppStore.getState().getWorkspace("proj1/ws1")).toEqual(ws);
    });

    it("returns undefined for unknown workspace", () => {
      useAppStore.setState({ projects: [makeProject()] });
      expect(useAppStore.getState().getWorkspace("proj1/nonexistent")).toBeUndefined();
    });
  });

  describe("getWorkspacesForProject()", () => {
    it("returns workspaces for the project", () => {
      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({ projects: [proj] });
      expect(useAppStore.getState().getWorkspacesForProject("proj1")).toEqual([ws]);
    });

    it("returns empty array for unknown project", () => {
      expect(useAppStore.getState().getWorkspacesForProject("unknown")).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // subscribePush — state:patch handler
  // -----------------------------------------------------------------------

  describe("subscribePush()", () => {
    it("subscribes to state:patch and returns unsubscribe function", () => {
      const unsub = vi.fn();
      mockSubscribe.mockReturnValueOnce(unsub);

      const unsubAll = useAppStore.getState().subscribePush();

      expect(mockSubscribe).toHaveBeenCalledWith("state:patch", expect.any(Function));

      unsubAll();
      expect(unsub).toHaveBeenCalled();
    });

    it("state:patch with projects replaces projects", () => {
      let patchCb: ((...args: unknown[]) => void) | undefined;
      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        patchCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      const newProjects = [makeProject({ id: "new-proj" })];
      patchCb!({ projects: newProjects });

      expect(useAppStore.getState().projects).toEqual(newProjects);
    });

    it("state:patch with settings replaces settings", () => {
      useAppStore.setState({ settings: { old: "val" } });

      let patchCb: ((...args: unknown[]) => void) | undefined;
      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        patchCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();
      patchCb!({ settings: { theme: "dark" } });

      expect(useAppStore.getState().settings).toEqual({ theme: "dark" });
    });

    it("state:patch with repoInfo merges by key", () => {
      useAppStore.setState({
        repoInfo: {
          "proj1/ws1": [{ branch: "main" }] as any,
          "proj1/ws2": [{ branch: "feat" }] as any,
        },
      });

      let patchCb: ((...args: unknown[]) => void) | undefined;
      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        patchCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();
      patchCb!({ repoInfo: { "proj1/ws1": [{ branch: "develop" }] } });

      expect(useAppStore.getState().repoInfo["proj1/ws1"]).toEqual([{ branch: "develop" }]);
      // ws2 preserved
      expect(useAppStore.getState().repoInfo["proj1/ws2"]).toEqual([{ branch: "feat" }]);
    });

    it("state:patch with projects prunes orphaned entries", () => {
      mockTerminalEntries.current = new Map([
        ["id-1", { workspaceId: "proj1/ws1" }],
        ["id-stale", { workspaceId: "proj1/ws-stale" }],
      ]);
      mockScriptsGetState.mockReturnValue({ currentWorkspaceId: null });

      useAppStore.setState({
        repoInfo: {
          "proj1/ws1": [],
          "proj1/ws-stale": [],
        },
        sessions: {
          "proj1/ws1": [],
          "proj1/ws-stale": [],
        },
      });

      let patchCb: ((...args: unknown[]) => void) | undefined;
      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        patchCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      patchCb!({ projects: [proj] });

      expect(useAppStore.getState().repoInfo["proj1/ws1"]).toBeDefined();
      expect(useAppStore.getState().repoInfo["proj1/ws-stale"]).toBeUndefined();
      expect(useAppStore.getState().sessions["proj1/ws1"]).toBeDefined();
      expect(useAppStore.getState().sessions["proj1/ws-stale"]).toBeUndefined();
      expect(mockTerminalDestroy).toHaveBeenCalledWith("id-stale");
      expect(mockTerminalDestroy).not.toHaveBeenCalledWith("id-1");
    });

    it("state:patch with projects prunes scripts store when currentWorkspaceId is stale", () => {
      mockTerminalEntries.current = new Map();
      mockScriptsGetState.mockReturnValue({ currentWorkspaceId: "proj1/ws-stale" });

      let patchCb: ((...args: unknown[]) => void) | undefined;
      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        patchCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      patchCb!({ projects: [proj] });

      expect(mockScriptsSetState).toHaveBeenCalledWith({
        config: null,
        currentWorkspaceId: null,
        logs: expect.any(Map),
        selectedLog: null,
      });
    });

    it("state:patch with projects does not prune scripts store when currentWorkspaceId is valid", () => {
      mockTerminalEntries.current = new Map();
      mockScriptsGetState.mockReturnValue({ currentWorkspaceId: "proj1/ws1" });

      let patchCb: ((...args: unknown[]) => void) | undefined;
      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        patchCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      patchCb!({ projects: [proj] });

      expect(mockScriptsSetState).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateProject / createWorkspace
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // deleteProject — error revert
  // -----------------------------------------------------------------------

  describe("deleteProject() error revert", () => {
    it("reverts optimistic removal when transport fails", async () => {
      const proj = makeProject({ id: "proj1" });
      useAppStore.setState({
        projects: [proj],
        selectedWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockRejectedValueOnce(new Error("server error"));

      await expect(useAppStore.getState().deleteProject("proj1")).rejects.toThrow("server error");

      // State should be reverted
      expect(useAppStore.getState().projects).toEqual([proj]);
      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/ws1");
    });

    it("reverts selection and prefs when deleting selected project fails", async () => {
      const proj = makeProject({ id: "proj1" });
      useAppStore.setState({
        projects: [proj],
        selectedWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await expect(useAppStore.getState().deleteProject("proj1")).rejects.toThrow("fail");

      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/ws1");
    });
  });

  // -----------------------------------------------------------------------
  // deleteWorkspace — error revert and fallback
  // -----------------------------------------------------------------------

  describe("deleteWorkspace() error revert and fallback", () => {
    it("falls back to main workspace when selected workspace is deleted", async () => {
      const mainWs = makeWorkspace({ id: "proj1/main", slug: "main" });
      const ws2 = makeWorkspace({ id: "proj1/ws2", slug: "ws2" });
      const proj = makeProject({ id: "proj1", workspaces: [mainWs, ws2] });
      useAppStore.setState({ projects: [proj], selectedWorkspaceId: "proj1/ws2" });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteWorkspace("proj1/ws2");

      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/main");
    });

    it("reverts optimistic removal when transport fails", async () => {
      const ws1 = makeWorkspace({ id: "proj1/ws1" });
      const ws2 = makeWorkspace({ id: "proj1/ws2" });
      const proj = makeProject({ id: "proj1", workspaces: [ws1, ws2] });
      useAppStore.setState({ projects: [proj], selectedWorkspaceId: "proj1/ws1" });
      mockRequest.mockRejectedValueOnce(new Error("server error"));

      await expect(useAppStore.getState().deleteWorkspace("proj1/ws2")).rejects.toThrow(
        "server error",
      );

      // Reverted
      expect(useAppStore.getState().projects[0]!.workspaces).toHaveLength(2);
    });

    it("reverts selection when deleting selected workspace fails", async () => {
      const mainWs = makeWorkspace({ id: "proj1/main", slug: "main" });
      const ws2 = makeWorkspace({ id: "proj1/ws2", slug: "ws2" });
      const proj = makeProject({ id: "proj1", workspaces: [mainWs, ws2] });
      useAppStore.setState({ projects: [proj], selectedWorkspaceId: "proj1/ws2" });
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await expect(useAppStore.getState().deleteWorkspace("proj1/ws2")).rejects.toThrow("fail");

      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/ws2");
    });
  });

  // -----------------------------------------------------------------------
  // getRepoInfo / getSessions selectors
  // -----------------------------------------------------------------------

  describe("getRepoInfo()", () => {
    it("returns repo info for known workspace", () => {
      const info = [{ branch: "main" }] as any;
      useAppStore.setState({ repoInfo: { "proj1/ws1": info } });
      expect(useAppStore.getState().getRepoInfo("proj1/ws1")).toEqual(info);
    });

    it("returns empty array for unknown workspace", () => {
      expect(useAppStore.getState().getRepoInfo("unknown")).toEqual([]);
    });
  });

  describe("getSessions()", () => {
    it("returns sessions for known key", () => {
      const sessions = [{ id: "sess1" }] as any;
      useAppStore.setState({ sessions: { "proj1/ws1": sessions } });
      expect(useAppStore.getState().getSessions("proj1/ws1")).toEqual(sessions);
    });

    it("returns empty array for unknown key", () => {
      expect(useAppStore.getState().getSessions("unknown")).toEqual([]);
    });
  });

  describe("updateProject()", () => {
    it("calls transport with correct params", async () => {
      mockRequest.mockResolvedValueOnce(undefined);
      await useAppStore.getState().updateProject("proj1", { name: "Updated" });
      expect(mockRequest).toHaveBeenCalledWith("projects.update", { id: "proj1", name: "Updated" });
    });
  });

  describe("createWorkspace()", () => {
    it("calls transport and returns the workspace", async () => {
      const ws = makeWorkspace({ id: "proj1/new-ws" });
      mockRequest.mockResolvedValueOnce(ws);

      const result = await useAppStore.getState().createWorkspace("proj1", {
        slug: "new-ws",
        name: "New WS",
      });

      expect(mockRequest).toHaveBeenCalledWith("workspaces.create", {
        projectId: "proj1",
        slug: "new-ws",
        name: "New WS",
      });
      expect(result).toEqual(ws);
    });
  });
});
