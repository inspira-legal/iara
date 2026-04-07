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
      mockRequest.mockResolvedValueOnce({ projects, settings, repoInfo: {}, sessions: {} });
      mockRequest.mockResolvedValueOnce({ claude: true, platform: "linux" });

      await useAppStore.getState().init();

      expect(mockRequest).toHaveBeenCalledWith("state.init", {});
      const state = useAppStore.getState();
      expect(state.projects).toEqual(projects);
      expect(state.settings).toEqual(settings);
      expect(state.initialized).toBe(true);
    });

    it("propagates transport errors", async () => {
      mockRequest.mockRejectedValueOnce(new Error("network"));
      mockRequest.mockResolvedValueOnce({ claude: true, platform: "linux" });
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
    it("optimistically updates the setting and calls transport", async () => {
      useAppStore.setState({ settings: { theme: "light" } });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().updateSetting("theme", "dark");

      expect(useAppStore.getState().settings.theme).toBe("dark");
      expect(mockRequest).toHaveBeenCalledWith("settings.set", { key: "theme", value: "dark" });
    });

    it("adds a new setting key", async () => {
      useAppStore.setState({ settings: {} });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().updateSetting("newKey", "newValue");

      expect(useAppStore.getState().settings.newKey).toBe("newValue");
    });
  });

  // -----------------------------------------------------------------------
  // onProjectChanged
  // -----------------------------------------------------------------------

  describe("onProjectChanged()", () => {
    it("replaces an existing project", () => {
      const proj = makeProject({ id: "proj1", name: "Old Name" });
      useAppStore.setState({ projects: [proj] });

      const updated = makeProject({ id: "proj1", name: "New Name" });
      useAppStore.getState().onProjectChanged(updated);

      expect(useAppStore.getState().projects[0]!.name).toBe("New Name");
      expect(useAppStore.getState().projects).toHaveLength(1);
    });

    it("adds a new project if not found", () => {
      const proj1 = makeProject({ id: "proj1" });
      useAppStore.setState({ projects: [proj1] });

      const proj2 = makeProject({ id: "proj2" });
      useAppStore.getState().onProjectChanged(proj2);

      expect(useAppStore.getState().projects).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // onWorkspaceChanged
  // -----------------------------------------------------------------------

  describe("onWorkspaceChanged()", () => {
    it("replaces an existing workspace in the parent project", () => {
      const ws = makeWorkspace({ id: "proj1/ws1", name: "Old" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({ projects: [proj] });

      const updated = makeWorkspace({ id: "proj1/ws1", projectId: "proj1", name: "Updated" });
      useAppStore.getState().onWorkspaceChanged(updated);

      expect(useAppStore.getState().projects[0]!.workspaces[0]!.name).toBe("Updated");
    });

    it("adds a new workspace if not found in project", () => {
      const proj = makeProject({ id: "proj1", workspaces: [] });
      useAppStore.setState({ projects: [proj] });

      const ws = makeWorkspace({ id: "proj1/ws-new", projectId: "proj1" });
      useAppStore.getState().onWorkspaceChanged(ws);

      expect(useAppStore.getState().projects[0]!.workspaces).toHaveLength(1);
      expect(useAppStore.getState().projects[0]!.workspaces[0]!.id).toBe("proj1/ws-new");
    });

    it("does nothing if project is not found", () => {
      const proj = makeProject({ id: "proj1" });
      useAppStore.setState({ projects: [proj] });

      const ws = makeWorkspace({ id: "unknown/ws1", projectId: "unknown" });
      useAppStore.getState().onWorkspaceChanged(ws);

      // State unchanged
      expect(useAppStore.getState().projects).toHaveLength(1);
      expect(useAppStore.getState().projects[0]!.workspaces).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // onStateResync
  // -----------------------------------------------------------------------

  describe("onStateResync()", () => {
    it("replaces full state", () => {
      useAppStore.setState({ projects: [makeProject()], settings: { a: "1" } });

      const newProjects = [makeProject({ id: "new" })];
      const newSettings = { b: "2" };
      useAppStore.getState().onStateResync({ projects: newProjects, settings: newSettings });

      expect(useAppStore.getState().projects).toEqual(newProjects);
      expect(useAppStore.getState().settings).toEqual(newSettings);
    });

    it("prunes repoInfo for deleted workspaces", () => {
      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({
        projects: [proj],
        repoInfo: {
          "proj1/ws1": [{ branch: "main", ahead: 0, behind: 0, hasChanges: false }] as any,
          "proj1/ws-deleted": [{ branch: "feat", ahead: 1, behind: 0, hasChanges: true }] as any,
        },
      });

      useAppStore.getState().onStateResync({ projects: [proj], settings: {} });

      const repoInfo = useAppStore.getState().repoInfo;
      expect(repoInfo["proj1/ws1"]).toBeDefined();
      expect(repoInfo["proj1/ws-deleted"]).toBeUndefined();
    });

    it("prunes sessions for deleted workspaces", () => {
      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({
        projects: [proj],
        sessions: {
          "proj1/ws1": [{ id: "sess1" }] as any,
          "proj1/ws-deleted": [{ id: "sess2" }] as any,
        },
      });

      useAppStore.getState().onStateResync({ projects: [proj], settings: {} });

      const sessions = useAppStore.getState().sessions;
      expect(sessions["proj1/ws1"]).toBeDefined();
      expect(sessions["proj1/ws-deleted"]).toBeUndefined();
    });

    it("keeps repoInfo and sessions when all workspaces are still valid", () => {
      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({
        projects: [proj],
        repoInfo: { "proj1/ws1": [] },
        sessions: { "proj1/ws1": [] },
      });

      useAppStore.getState().onStateResync({ projects: [proj], settings: {} });

      expect(useAppStore.getState().repoInfo["proj1/ws1"]).toBeDefined();
      expect(useAppStore.getState().sessions["proj1/ws1"]).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // onSettingsChanged
  // -----------------------------------------------------------------------

  describe("onSettingsChanged()", () => {
    it("updates a single setting key", () => {
      useAppStore.setState({ settings: { a: "1", b: "2" } });
      useAppStore.getState().onSettingsChanged("a", "updated");
      expect(useAppStore.getState().settings).toEqual({ a: "updated", b: "2" });
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
  // subscribePush
  // -----------------------------------------------------------------------

  describe("subscribePush()", () => {
    it("subscribes to events and returns unsubscribe function", () => {
      const unsubs = Array.from({ length: 6 }, () => vi.fn());
      for (const unsub of unsubs) {
        mockSubscribe.mockReturnValueOnce(unsub);
      }

      const unsubAll = useAppStore.getState().subscribePush();

      expect(mockSubscribe).toHaveBeenCalledWith("project:changed", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("workspace:changed", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("state:resync", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("settings:changed", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("session:changed", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("repos:changed", expect.any(Function));

      unsubAll();
      for (const unsub of unsubs) {
        expect(unsub).toHaveBeenCalled();
      }
    });

    it("project:changed callback calls onProjectChanged", () => {
      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "project:changed") {
          const proj = makeProject({ id: "push-proj", name: "Pushed" });
          cb({ project: proj });
        }
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      expect(useAppStore.getState().projects.find((p) => p.id === "push-proj")).toBeDefined();
    });

    it("workspace:changed callback calls onWorkspaceChanged", () => {
      const proj = makeProject({ id: "proj1", workspaces: [] });
      useAppStore.setState({ projects: [proj] });

      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "workspace:changed") {
          const ws = makeWorkspace({ id: "proj1/pushed-ws", projectId: "proj1" });
          cb({ workspace: ws });
        }
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      expect(useAppStore.getState().projects[0]!.workspaces).toHaveLength(1);
    });

    it("state:resync callback calls onStateResync", () => {
      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "state:resync") {
          cb({ state: { projects: [makeProject({ id: "resync" })], settings: { x: "y" } } });
        }
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      expect(useAppStore.getState().projects).toHaveLength(1);
      expect(useAppStore.getState().projects[0]!.id).toBe("resync");
      expect(useAppStore.getState().settings).toEqual({ x: "y" });
    });

    it("state:resync prunes terminal entries for deleted workspaces", async () => {
      mockTerminalEntries.current = new Map([
        ["id-1", { workspaceId: "proj1/ws1" }],
        ["id-stale", { workspaceId: "proj1/ws-stale" }],
      ]);
      mockScriptsGetState.mockReturnValue({ currentWorkspaceId: null });

      let resyncCb: ((...args: unknown[]) => void) | undefined = undefined;
      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "state:resync") resyncCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      await resyncCb!({ state: { projects: [proj], settings: {} } });

      expect(mockTerminalDestroy).toHaveBeenCalledWith("id-stale");
      expect(mockTerminalDestroy).not.toHaveBeenCalledWith("id-1");
    });

    it("state:resync prunes scripts store when currentWorkspaceId is stale", async () => {
      mockTerminalEntries.current = new Map();
      mockScriptsGetState.mockReturnValue({ currentWorkspaceId: "proj1/ws-stale" });

      let resyncCb: ((...args: unknown[]) => void) | undefined = undefined;
      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "state:resync") resyncCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      await resyncCb!({ state: { projects: [proj], settings: {} } });

      expect(mockScriptsSetState).toHaveBeenCalledWith({
        config: null,
        currentWorkspaceId: null,
        logs: expect.any(Map),
        selectedLog: null,
      });
    });

    it("state:resync does not prune scripts store when currentWorkspaceId is still valid", async () => {
      mockTerminalEntries.current = new Map();
      mockScriptsGetState.mockReturnValue({ currentWorkspaceId: "proj1/ws1" });

      let resyncCb: ((...args: unknown[]) => void) | undefined = undefined;
      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "state:resync") resyncCb = cb;
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      await resyncCb!({ state: { projects: [proj], settings: {} } });

      expect(mockScriptsSetState).not.toHaveBeenCalled();
    });

    it("session:changed callback triggers refreshSessions", () => {
      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "session:changed") {
          cb({ workspaceId: "proj1/ws1" });
        }
        return vi.fn();
      });

      // Seed sessions so we can check refresh was called
      mockRequest.mockResolvedValueOnce([{ id: "new-sess" }]);
      useAppStore.getState().subscribePush();

      // refreshSessions is called via void (fire-and-forget)
      expect(mockRequest).toHaveBeenCalledWith("sessions.list", { workspaceId: "proj1/ws1" });
    });

    it("repos:changed callback uses workspaceId as key when present", () => {
      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "repos:changed") {
          cb({
            projectId: "proj1",
            workspaceId: "proj1/ws1",
            repoInfo: [{ branch: "main" }],
          });
        }
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      expect(useAppStore.getState().repoInfo["proj1/ws1"]).toEqual([{ branch: "main" }]);
    });

    it("repos:changed callback falls back to project:projectId key when workspaceId is null", () => {
      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "repos:changed") {
          cb({
            projectId: "proj1",
            workspaceId: undefined,
            repoInfo: [{ branch: "develop" }],
          });
        }
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      expect(useAppStore.getState().repoInfo["project:proj1"]).toEqual([{ branch: "develop" }]);
    });

    it("settings:changed callback calls onSettingsChanged", () => {
      useAppStore.setState({ settings: { old: "val" } });

      mockSubscribe.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "settings:changed") {
          cb({ key: "theme", value: "dark" });
        }
        return vi.fn();
      });

      useAppStore.getState().subscribePush();

      expect(useAppStore.getState().settings.theme).toBe("dark");
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
  // refreshRepoInfo / refreshSessions
  // -----------------------------------------------------------------------

  describe("refreshRepoInfo()", () => {
    it("fetches and stores repo info", async () => {
      const info = [{ branch: "main", ahead: 0, behind: 0, hasChanges: false }];
      mockRequest.mockResolvedValueOnce(info);

      await useAppStore.getState().refreshRepoInfo("proj1", "proj1/ws1", "proj1/ws1");

      expect(mockRequest).toHaveBeenCalledWith("repos.getInfo", {
        projectId: "proj1",
        workspaceId: "proj1/ws1",
      });
      expect(useAppStore.getState().repoInfo["proj1/ws1"]).toEqual(info);
    });

    it("calls without workspaceId param when not provided", async () => {
      const info = [{ branch: "main" }];
      mockRequest.mockResolvedValueOnce(info);

      await useAppStore.getState().refreshRepoInfo("proj1", "proj1/ws1");

      expect(mockRequest).toHaveBeenCalledWith("repos.getInfo", { projectId: "proj1" });
    });

    it("keeps stale data on error", async () => {
      useAppStore.setState({ repoInfo: { "proj1/ws1": [{ branch: "old" }] as any } });
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useAppStore.getState().refreshRepoInfo("proj1", "proj1/ws1");

      expect(useAppStore.getState().repoInfo["proj1/ws1"]).toEqual([{ branch: "old" }]);
    });
  });

  describe("refreshSessions()", () => {
    it("fetches and stores sessions", async () => {
      const sessions = [{ id: "sess1" }];
      mockRequest.mockResolvedValueOnce(sessions);

      await useAppStore.getState().refreshSessions("proj1/ws1");

      expect(mockRequest).toHaveBeenCalledWith("sessions.list", { workspaceId: "proj1/ws1" });
      expect(useAppStore.getState().sessions["proj1/ws1"]).toEqual(sessions);
    });

    it("keeps stale data on error", async () => {
      useAppStore.setState({ sessions: { "proj1/ws1": [{ id: "old" }] as any } });
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useAppStore.getState().refreshSessions("proj1/ws1");

      expect(useAppStore.getState().sessions["proj1/ws1"]).toEqual([{ id: "old" }]);
    });
  });

  describe("refreshSessionsByProject()", () => {
    it("fetches and stores sessions by project key", async () => {
      const sessions = [{ id: "sess1" }];
      mockRequest.mockResolvedValueOnce(sessions);

      await useAppStore.getState().refreshSessionsByProject("proj1");

      expect(mockRequest).toHaveBeenCalledWith("sessions.listByProject", { projectId: "proj1" });
      expect(useAppStore.getState().sessions["project:proj1"]).toEqual(sessions);
    });

    it("keeps stale data on error", async () => {
      useAppStore.setState({ sessions: { "project:proj1": [{ id: "old" }] as any } });
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useAppStore.getState().refreshSessionsByProject("proj1");

      expect(useAppStore.getState().sessions["project:proj1"]).toEqual([{ id: "old" }]);
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
