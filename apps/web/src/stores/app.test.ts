import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project, Workspace } from "@iara/contracts";

// ---------------------------------------------------------------------------
// Transport mock
// ---------------------------------------------------------------------------

const { mockRequest, mockSubscribe } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockSubscribe: vi.fn((_event: string, _cb: (...args: unknown[]) => void) => vi.fn()),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
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
    type: "default",
    name: "Workspace 1",
    description: "",
    createdAt: "2025-01-01",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj1",
    slug: "proj1",
    name: "Project 1",
    description: "",
    repoSources: [],
    workspaces: [makeWorkspace()],
    createdAt: "2025-01-01",
    ...overrides,
  };
}

const INITIAL_STATE = {
  projects: [],
  settings: {},
  selectedProjectId: null,
  selectedWorkspaceId: null,
  initialized: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState(INITIAL_STATE);
});

describe("useAppStore", () => {
  // -----------------------------------------------------------------------
  // init
  // -----------------------------------------------------------------------

  describe("init()", () => {
    it("calls transport.request('state.init') and sets state", async () => {
      const projects = [makeProject()];
      const settings = { theme: "dark" };
      mockRequest.mockResolvedValueOnce({ projects, settings });

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
  // selectProject
  // -----------------------------------------------------------------------

  describe("selectProject()", () => {
    it("null clears both selections", () => {
      useAppStore.setState({ selectedProjectId: "proj1", selectedWorkspaceId: "proj1/ws1" });
      useAppStore.getState().selectProject(null);
      expect(useAppStore.getState().selectedProjectId).toBeNull();
      expect(useAppStore.getState().selectedWorkspaceId).toBeNull();
    });

    it("selecting project clears workspace if workspace does not belong to it", () => {
      const proj1 = makeProject({
        id: "proj1",
        workspaces: [makeWorkspace({ id: "proj1/ws1", projectId: "proj1" })],
      });
      const proj2 = makeProject({ id: "proj2", workspaces: [] });
      useAppStore.setState({
        projects: [proj1, proj2],
        selectedProjectId: "proj1",
        selectedWorkspaceId: "proj1/ws1",
      });

      useAppStore.getState().selectProject("proj2");
      expect(useAppStore.getState().selectedProjectId).toBe("proj2");
      expect(useAppStore.getState().selectedWorkspaceId).toBeNull();
    });

    it("keeps workspace selection if workspace belongs to the selected project", () => {
      const proj = makeProject({
        id: "proj1",
        workspaces: [makeWorkspace({ id: "proj1/ws1", projectId: "proj1" })],
      });
      useAppStore.setState({
        projects: [proj],
        selectedProjectId: "proj1",
        selectedWorkspaceId: "proj1/ws1",
      });

      useAppStore.getState().selectProject("proj1");
      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/ws1");
    });

    it("clears workspace when selecting a project without workspaces", () => {
      const proj = makeProject({ id: "proj1", workspaces: [] });
      useAppStore.setState({
        projects: [proj],
        selectedProjectId: null,
        selectedWorkspaceId: "other/ws",
      });

      useAppStore.getState().selectProject("proj1");
      expect(useAppStore.getState().selectedWorkspaceId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // selectWorkspace
  // -----------------------------------------------------------------------

  describe("selectWorkspace()", () => {
    it("null clears workspace selection only", () => {
      useAppStore.setState({ selectedProjectId: "proj1", selectedWorkspaceId: "proj1/ws1" });
      useAppStore.getState().selectWorkspace(null);
      expect(useAppStore.getState().selectedWorkspaceId).toBeNull();
      expect(useAppStore.getState().selectedProjectId).toBe("proj1");
    });

    it("derives projectId from the workspace", () => {
      const proj = makeProject({ id: "proj1", workspaces: [makeWorkspace({ id: "proj1/ws1" })] });
      useAppStore.setState({ projects: [proj] });

      useAppStore.getState().selectWorkspace("proj1/ws1");
      expect(useAppStore.getState().selectedWorkspaceId).toBe("proj1/ws1");
      expect(useAppStore.getState().selectedProjectId).toBe("proj1");
    });

    it("sets workspace even if not found in any project", () => {
      useAppStore.setState({ projects: [] });
      useAppStore.getState().selectWorkspace("unknown/ws");
      expect(useAppStore.getState().selectedWorkspaceId).toBe("unknown/ws");
    });
  });

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
        selectedProjectId: "proj1",
        selectedWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteProject("proj1");

      expect(useAppStore.getState().selectedProjectId).toBeNull();
      expect(useAppStore.getState().selectedWorkspaceId).toBeNull();
    });

    it("does not clear selection if a different project was deleted", async () => {
      const proj1 = makeProject({ id: "proj1" });
      const proj2 = makeProject({ id: "proj2", workspaces: [] });
      useAppStore.setState({
        projects: [proj1, proj2],
        selectedProjectId: "proj1",
        selectedWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockResolvedValueOnce(undefined);

      await useAppStore.getState().deleteProject("proj2");

      expect(useAppStore.getState().selectedProjectId).toBe("proj1");
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

    it("falls back to searching all projects for ids without separator", () => {
      const ws = makeWorkspace({ id: "flat-ws" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({ projects: [proj] });
      expect(useAppStore.getState().getWorkspace("flat-ws")).toEqual(ws);
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

  describe("selectedProject()", () => {
    it("returns selected project", () => {
      const proj = makeProject({ id: "proj1" });
      useAppStore.setState({ projects: [proj], selectedProjectId: "proj1" });
      expect(useAppStore.getState().selectedProject()).toEqual(proj);
    });

    it("returns undefined when nothing selected", () => {
      expect(useAppStore.getState().selectedProject()).toBeUndefined();
    });
  });

  describe("selectedWorkspace()", () => {
    it("returns selected workspace", () => {
      const ws = makeWorkspace({ id: "proj1/ws1" });
      const proj = makeProject({ id: "proj1", workspaces: [ws] });
      useAppStore.setState({ projects: [proj], selectedWorkspaceId: "proj1/ws1" });
      expect(useAppStore.getState().selectedWorkspace()).toEqual(ws);
    });

    it("returns undefined when nothing selected", () => {
      expect(useAppStore.getState().selectedWorkspace()).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // subscribePush
  // -----------------------------------------------------------------------

  describe("subscribePush()", () => {
    it("subscribes to four events and returns unsubscribe function", () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      const unsub3 = vi.fn();
      const unsub4 = vi.fn();
      mockSubscribe
        .mockReturnValueOnce(unsub1)
        .mockReturnValueOnce(unsub2)
        .mockReturnValueOnce(unsub3)
        .mockReturnValueOnce(unsub4);

      const unsubAll = useAppStore.getState().subscribePush();

      expect(mockSubscribe).toHaveBeenCalledTimes(4);
      expect(mockSubscribe).toHaveBeenCalledWith("project:changed", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("workspace:changed", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("state:resync", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("settings:changed", expect.any(Function));

      unsubAll();
      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
      expect(unsub3).toHaveBeenCalled();
      expect(unsub4).toHaveBeenCalled();
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
