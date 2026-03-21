import { create } from "zustand";
import type {
  Project,
  Workspace,
  CreateProjectInput,
  UpdateProjectInput,
  CreateWorkspaceInput,
} from "@iara/contracts";
import { transport } from "~/lib/ws-transport";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AppState {
  projects: Project[];
  settings: Record<string, string>;
  selectedProjectId: string | null;
  selectedWorkspaceId: string | null;
  initialized: boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface AppActions {
  // Initialisation
  init(): Promise<void>;

  // Selection
  selectProject(id: string | null): void;
  selectWorkspace(id: string | null): void;

  // Projects
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, input: UpdateProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Workspaces
  createWorkspace(projectId: string, input: CreateWorkspaceInput): Promise<Workspace>;
  deleteWorkspace(workspaceId: string): Promise<void>;

  // Settings
  updateSetting(key: string, value: string): Promise<void>;

  // Push handlers
  onProjectChanged(project: Project): void;
  onWorkspaceChanged(workspace: Workspace): void;
  onStateResync(state: { projects: Project[]; settings: Record<string, string> }): void;
  onSettingsChanged(key: string, value: string): void;

  // Selectors
  getProject(id: string): Project | undefined;
  getWorkspace(workspaceId: string): Workspace | undefined;
  getWorkspacesForProject(projectId: string): Workspace[];
  selectedProject(): Project | undefined;
  selectedWorkspace(): Workspace | undefined;

  // Push subscription
  subscribePush(): () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  projects: [],
  settings: {},
  selectedProjectId: null,
  selectedWorkspaceId: null,
  initialized: false,

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  init: async () => {
    const { projects, settings } = await transport.request("state.init", {});
    set({ projects, settings, initialized: true });
  },

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  selectProject: (id) => {
    if (id === null) {
      set({ selectedProjectId: null, selectedWorkspaceId: null });
      return;
    }

    const state = get();
    const project = state.projects.find((p) => p.id === id);
    // Clear workspace selection unless the workspace belongs to the selected project
    const keepWorkspace =
      state.selectedWorkspaceId != null &&
      project?.workspaces.some((w) => w.id === state.selectedWorkspaceId);

    set({
      selectedProjectId: id,
      selectedWorkspaceId: keepWorkspace ? state.selectedWorkspaceId : null,
    });
  },

  selectWorkspace: (id) => {
    if (id === null) {
      set({ selectedWorkspaceId: null });
      return;
    }

    // Derive projectId from the workspace
    const state = get();
    for (const project of state.projects) {
      if (project.workspaces.some((w) => w.id === id)) {
        set({ selectedWorkspaceId: id, selectedProjectId: project.id });
        return;
      }
    }

    // Workspace not found in any project — just set it
    set({ selectedWorkspaceId: id });
  },

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  createProject: async (input) => {
    const project = await transport.request("projects.create", input);
    // State updates come via push events
    return project;
  },

  updateProject: async (id, input) => {
    await transport.request("projects.update", { id, ...input });
    // State updates come via push events
  },

  deleteProject: async (id) => {
    // Optimistically remove from state
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
      selectedWorkspaceId: state.selectedProjectId === id ? null : state.selectedWorkspaceId,
    }));
    await transport.request("projects.delete", { id });
  },

  // ---------------------------------------------------------------------------
  // Workspaces
  // ---------------------------------------------------------------------------

  createWorkspace: async (projectId, input) => {
    const workspace = await transport.request("workspaces.create", { projectId, ...input });
    // State updates come via push events
    return workspace;
  },

  deleteWorkspace: async (workspaceId) => {
    // Optimistically remove from state
    set((state) => ({
      projects: state.projects.map((p) => ({
        ...p,
        workspaces: p.workspaces.filter((w) => w.id !== workspaceId),
      })),
      selectedWorkspaceId:
        state.selectedWorkspaceId === workspaceId ? null : state.selectedWorkspaceId,
    }));
    await transport.request("workspaces.delete", { workspaceId });
  },

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  updateSetting: async (key, value) => {
    // Optimistic update
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }));
    await transport.request("settings.set", { key, value });
  },

  // ---------------------------------------------------------------------------
  // Push handlers
  // ---------------------------------------------------------------------------

  onProjectChanged: (project) => {
    set((state) => {
      const idx = state.projects.findIndex((p) => p.id === project.id);
      if (idx === -1) {
        return { projects: [...state.projects, project] };
      }
      const next = [...state.projects];
      next[idx] = project;
      return { projects: next };
    });
  },

  onWorkspaceChanged: (workspace) => {
    set((state) => {
      const pIdx = state.projects.findIndex((p) => p.id === workspace.projectId);
      if (pIdx === -1) return state;
      const project = state.projects[pIdx]!;
      const wIdx = project.workspaces.findIndex((w) => w.id === workspace.id);
      const nextWorkspaces =
        wIdx === -1
          ? [...project.workspaces, workspace]
          : [...project.workspaces.slice(0, wIdx), workspace, ...project.workspaces.slice(wIdx + 1)];
      const next = [...state.projects];
      next[pIdx] = { ...project, workspaces: nextWorkspaces };
      return { projects: next };
    });
  },

  onStateResync: (payload) => {
    set({ projects: payload.projects, settings: payload.settings });
  },

  onSettingsChanged: (key, value) => {
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }));
  },

  // ---------------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------------

  getProject: (id) => {
    return get().projects.find((p) => p.id === id);
  },

  getWorkspace: (workspaceId) => {
    // workspaceId format: "<projectId>/<slug>" — parse projectId from it
    const separatorIdx = workspaceId.indexOf("/");
    if (separatorIdx !== -1) {
      const projectId = workspaceId.slice(0, separatorIdx);
      const project = get().projects.find((p) => p.id === projectId);
      return project?.workspaces.find((w) => w.id === workspaceId);
    }
    // Fallback: search all projects
    for (const project of get().projects) {
      const ws = project.workspaces.find((w) => w.id === workspaceId);
      if (ws) return ws;
    }
    return undefined;
  },

  getWorkspacesForProject: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId);
    return project?.workspaces ?? [];
  },

  selectedProject: () => {
    const { selectedProjectId, projects } = get();
    if (!selectedProjectId) return undefined;
    return projects.find((p) => p.id === selectedProjectId);
  },

  selectedWorkspace: () => {
    const { selectedWorkspaceId } = get();
    if (!selectedWorkspaceId) return undefined;
    return get().getWorkspace(selectedWorkspaceId);
  },

  // ---------------------------------------------------------------------------
  // Push subscription
  // ---------------------------------------------------------------------------

  subscribePush: () => {
    const unsubs = [
      transport.subscribe("project:changed", (params) => {
        get().onProjectChanged(params.project);
      }),
      transport.subscribe("workspace:changed", (params) => {
        get().onWorkspaceChanged(params.workspace);
      }),
      transport.subscribe("state:resync", (params) => {
        get().onStateResync(params.state);
      }),
      transport.subscribe("settings:changed", (params) => {
        get().onSettingsChanged(params.key, params.value);
      }),
    ];

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  },
}));
