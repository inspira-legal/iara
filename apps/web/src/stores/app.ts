import { create } from "zustand";
import type {
  AppCapabilities,
  CreateProjectInput,
  UpdateProjectInput,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  Project,
  Workspace,
  RepoInfo,
  SessionInfo,
} from "@iara/contracts";
import { transport } from "~/lib/ws-transport";
import { LocalCache } from "~/lib/local-cache";
import { AppCacheSchema } from "~/lib/cache-schemas";
const ROOT_WORKSPACE_SLUG = "main";

const appCache = new LocalCache({
  key: "iara:app",
  version: 1,
  schema: AppCacheSchema,
});

function savePrefs(settings: Record<string, string>, workspaceId: string | null): void {
  appCache.set({ settings, workspaceId });
}

/** Derive projectId from workspaceId (format: "projectId/slug") */
function projectIdFromWorkspaceId(workspaceId: string): string {
  return workspaceId.split("/")[0]!;
}

const cached = appCache.get();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AppState {
  projects: Project[];
  settings: Record<string, string>;
  repoInfo: Record<string, RepoInfo[]>;
  sessions: Record<string, SessionInfo[]>;
  capabilities: AppCapabilities;
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
  selectWorkspace(id: string | null): void;

  // Projects
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, input: UpdateProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Workspaces
  createWorkspace(
    projectId: string,
    input: CreateWorkspaceInput & { branch?: string },
  ): Promise<Workspace>;
  updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;

  // Settings
  updateSetting(key: string, value: string): Promise<void>;

  // Repo info
  getRepoInfo(workspaceId: string): RepoInfo[];
  refreshRepoInfo(projectId: string, cacheKey: string, workspaceId?: string): Promise<void>;

  // Sessions
  getSessions(key: string): SessionInfo[];
  refreshSessions(workspaceId: string): Promise<void>;
  refreshSessionsByProject(projectId: string): Promise<void>;

  // Push handlers
  onProjectChanged(project: Project): void;
  onWorkspaceChanged(workspace: Workspace): void;
  onStateResync(state: { projects: Project[]; settings: Record<string, string> }): void;
  onSettingsChanged(key: string, value: string): void;

  // Selectors
  getProject(id: string): Project | undefined;
  getWorkspace(workspaceId: string): Workspace | undefined;
  getWorkspacesForProject(projectId: string): Workspace[];
  // Push subscription
  subscribePush(): () => void;
}

// ---------------------------------------------------------------------------
// Restore selection from cache
// ---------------------------------------------------------------------------

/** Validate saved workspaceId against fresh project data, falling back to main workspace. */
function restoreSelection(projects: Project[], workspaceId: string | null): string | null {
  if (!workspaceId) return null;

  const projectId = projectIdFromWorkspaceId(workspaceId);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  const workspace = project.workspaces.find((w) => w.id === workspaceId);
  if (workspace) return workspace.id;

  // Fall back to main workspace of this project
  const main = project.workspaces.find((w) => w.slug === ROOT_WORKSPACE_SLUG);
  return main?.id ?? null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const EMPTY_REPO_INFO: RepoInfo[] = [];
const EMPTY_SESSIONS: SessionInfo[] = [];

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  projects: [],
  settings: cached?.settings ?? {},
  repoInfo: {},
  sessions: {},
  capabilities: { claude: true, platform: "linux" as NodeJS.Platform },
  selectedWorkspaceId: cached?.workspaceId ?? null,
  initialized: false,

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  init: async () => {
    const [stateResult, capabilities] = await Promise.all([
      transport.request("state.init", {}),
      transport
        .request("app.capabilities", {})
        .catch((): AppCapabilities => ({ claude: true, platform: "linux" })),
    ]);
    const { projects, settings, repoInfo, sessions } = stateResult;

    // Restore selection against fresh data (re-read cache in case it changed since module load)
    const freshCache = appCache.get();
    const workspaceId = restoreSelection(projects, freshCache?.workspaceId ?? null);

    set({
      projects,
      settings,
      repoInfo,
      sessions,
      capabilities,
      initialized: true,
      selectedWorkspaceId: workspaceId,
    });
    savePrefs(settings, workspaceId);
  },

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  selectWorkspace: (id) => {
    set({ selectedWorkspaceId: id });
    savePrefs(get().settings, id);
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
    const prev = get();
    const currentProjectId = prev.selectedWorkspaceId
      ? projectIdFromWorkspaceId(prev.selectedWorkspaceId)
      : null;
    const wasSelected = currentProjectId === id;

    // Optimistically remove from state
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      selectedWorkspaceId: wasSelected ? null : s.selectedWorkspaceId,
    }));
    if (wasSelected) {
      savePrefs(get().settings, null);
    }
    try {
      await transport.request("projects.delete", { id });
    } catch (err) {
      // Revert optimistic update
      set({ projects: prev.projects, selectedWorkspaceId: prev.selectedWorkspaceId });
      if (wasSelected) savePrefs(get().settings, prev.selectedWorkspaceId);
      throw err;
    }
  },

  // ---------------------------------------------------------------------------
  // Workspaces
  // ---------------------------------------------------------------------------

  createWorkspace: async (projectId, input) => {
    const workspace = await transport.request("workspaces.create", { projectId, ...input });
    // State updates come via push events
    return workspace;
  },

  updateWorkspace: async (workspaceId, input) => {
    await transport.request("workspaces.update", { workspaceId, ...input });
    // State updates come via push events (workspace:changed)
  },

  deleteWorkspace: async (workspaceId) => {
    const prev = get();
    const wasSelected = prev.selectedWorkspaceId === workspaceId;
    let fallbackId: string | null = null;
    if (wasSelected) {
      const projectId = projectIdFromWorkspaceId(workspaceId);
      const project = prev.projects.find((p) => p.id === projectId);
      const main = project?.workspaces.find((w) => w.slug === ROOT_WORKSPACE_SLUG);
      fallbackId = main?.id ?? null;
    }

    // Optimistically remove from state
    set((s) => ({
      projects: s.projects.map((p) => ({
        ...p,
        workspaces: p.workspaces.filter((w) => w.id !== workspaceId),
      })),
      selectedWorkspaceId: wasSelected ? fallbackId : s.selectedWorkspaceId,
    }));
    if (wasSelected) {
      savePrefs(get().settings, fallbackId);
    }
    try {
      await transport.request("workspaces.delete", { workspaceId });
    } catch (err) {
      // Revert optimistic update
      set({ projects: prev.projects, selectedWorkspaceId: prev.selectedWorkspaceId });
      if (wasSelected) savePrefs(get().settings, prev.selectedWorkspaceId);
      throw err;
    }
  },

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  updateSetting: async (key, value) => {
    // Optimistic update
    const newSettings = { ...get().settings, [key]: value };
    set({ settings: newSettings });
    savePrefs(newSettings, get().selectedWorkspaceId);
    await transport.request("settings.set", { key, value });
  },

  // ---------------------------------------------------------------------------
  // Repo info
  // ---------------------------------------------------------------------------

  getRepoInfo: (workspaceId) => {
    return get().repoInfo[workspaceId] ?? EMPTY_REPO_INFO;
  },

  refreshRepoInfo: async (projectId, cacheKey, workspaceId) => {
    try {
      const info = await transport.request("repos.getInfo", {
        projectId,
        ...(workspaceId ? { workspaceId } : {}),
      });
      set((state) => ({
        repoInfo: { ...state.repoInfo, [cacheKey]: info },
      }));
    } catch {
      // ignore — keep stale data
    }
  },

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  getSessions: (key) => {
    return get().sessions[key] ?? EMPTY_SESSIONS;
  },

  refreshSessions: async (workspaceId) => {
    try {
      const sessions = await transport.request("sessions.list", { workspaceId });
      set((state) => ({
        sessions: { ...state.sessions, [workspaceId]: sessions },
      }));
    } catch {
      // ignore — keep stale data
    }
  },

  refreshSessionsByProject: async (projectId) => {
    try {
      const sessions = await transport.request("sessions.listByProject", { projectId });
      set((state) => ({
        sessions: { ...state.sessions, [`project:${projectId}`]: sessions },
      }));
    } catch {
      // ignore — keep stale data
    }
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
          : [
              ...project.workspaces.slice(0, wIdx),
              workspace,
              ...project.workspaces.slice(wIdx + 1),
            ];
      const next = [...state.projects];
      next[pIdx] = { ...project, workspaces: nextWorkspaces };
      return { projects: next };
    });
  },

  onStateResync: (payload) => {
    const validWsIds = new Set(payload.projects.flatMap((p) => p.workspaces.map((w) => w.id)));
    // Prune stale repoInfo/sessions for deleted workspaces
    const repoInfo = { ...get().repoInfo };
    const sessions = { ...get().sessions };
    for (const key of Object.keys(repoInfo)) {
      if (!validWsIds.has(key)) delete repoInfo[key];
    }
    for (const key of Object.keys(sessions)) {
      if (!validWsIds.has(key)) delete sessions[key];
    }
    set({ projects: payload.projects, settings: payload.settings, repoInfo, sessions });
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
    const projectId = projectIdFromWorkspaceId(workspaceId);
    const project = get().projects.find((p) => p.id === projectId);
    return project?.workspaces.find((w) => w.id === workspaceId);
  },

  getWorkspacesForProject: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId);
    return project?.workspaces ?? [];
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
      transport.subscribe("state:resync", async (params) => {
        get().onStateResync(params.state);

        // Prune stale entries from other stores for deleted workspaces
        const validWsIds = new Set(
          params.state.projects.flatMap((p: any) => p.workspaces.map((w: any) => w.id)),
        );
        const { useActiveSessionStore } = await import("./activeSession.js");
        for (const [entryId, entry] of useActiveSessionStore.getState().entries) {
          if (!validWsIds.has(entry.workspaceId)) {
            void useActiveSessionStore.getState().destroy(entryId);
          }
        }
        const { useScriptsStore } = await import("./scripts.js");
        const scripts = useScriptsStore.getState();
        if (scripts.currentWorkspaceId && !validWsIds.has(scripts.currentWorkspaceId)) {
          useScriptsStore.setState({
            config: null,
            currentWorkspaceId: null,
            logs: new Map(),
            selectedLog: null,
          });
        }
      }),
      transport.subscribe("settings:changed", (params) => {
        get().onSettingsChanged(params.key, params.value);
      }),
      transport.subscribe("session:changed", ({ workspaceId }) => {
        void get().refreshSessions(workspaceId);
      }),
      transport.subscribe("repos:changed", ({ projectId, workspaceId, repoInfo }) => {
        const key = workspaceId ?? `project:${projectId}`;
        set((state) => ({
          repoInfo: { ...state.repoInfo, [key]: repoInfo },
        }));
      }),
    ];

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  },
}));
