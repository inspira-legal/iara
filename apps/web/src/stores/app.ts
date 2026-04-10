import { create } from "zustand";
import type {
  AppCapabilities,
  AppInfo,
  CreateProjectInput,
  UpdateProjectInput,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  Project,
  Workspace,
  RepoInfo,
  SessionInfo,
  EnvData,
  ScriptsConfig,
  ScriptStatus,
} from "@iara/contracts";
import { transport } from "~/lib/ws-transport";
import { LocalCache } from "~/lib/local-cache";
import { AppCacheSchema } from "~/lib/cache-schemas";
import { useActiveSessionStore } from "./activeSession.js";
import { useScriptsStore } from "./scripts";

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
  env: Record<string, EnvData>;
  scripts: Record<string, ScriptsConfig>;
  scriptStatuses: Record<string, ScriptStatus[]>;
  appInfo: AppInfo | null;
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

  // Sessions
  getSessions(key: string): SessionInfo[];

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
// Orphan pruning helper
// ---------------------------------------------------------------------------

function pruneOrphans(validWsIds: Set<string>, ...maps: Record<string, unknown>[]): void {
  for (const map of maps) {
    for (const key of Object.keys(map)) {
      if (!validWsIds.has(key)) delete map[key];
    }
  }
  // Prune active session entries for deleted workspaces
  for (const [entryId, entry] of useActiveSessionStore.getState().entries) {
    if (!validWsIds.has(entry.workspaceId)) {
      void useActiveSessionStore.getState().destroy(entryId);
    }
  }
  // Prune scripts store if its workspace was deleted
  const scriptsState = useScriptsStore.getState();
  if (scriptsState.currentWorkspaceId && !validWsIds.has(scriptsState.currentWorkspaceId)) {
    useScriptsStore.setState({
      config: null,
      currentWorkspaceId: null,
      logs: new Map(),
      selectedLog: null,
    });
  }
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
  env: {},
  scripts: {},
  scriptStatuses: {},
  appInfo: null,
  capabilities: { claude: true, platform: "linux" as NodeJS.Platform },
  selectedWorkspaceId: cached?.workspaceId ?? null,
  initialized: false,

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  init: async () => {
    const result = await transport.request("state.init", {});
    const {
      projects,
      settings,
      repoInfo,
      sessions,
      env,
      scripts,
      scriptStatuses,
      appInfo,
      capabilities,
    } = result;

    // Restore selection against fresh data (re-read cache in case it changed since module load)
    const freshCache = appCache.get();
    const workspaceId = restoreSelection(projects, freshCache?.workspaceId ?? null);

    set({
      projects,
      settings,
      repoInfo,
      sessions,
      env,
      scripts,
      scriptStatuses,
      appInfo,
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
    // State updates come via push events
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

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  getSessions: (key) => {
    return get().sessions[key] ?? EMPTY_SESSIONS;
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
  // Push subscription — single state:patch handler
  // ---------------------------------------------------------------------------

  subscribePush: () => {
    const unsub = transport.subscribe("state:patch", (patch) => {
      set((state) => {
        const next: Partial<AppState> = {};

        // Full-replace fields
        if (patch.projects) next.projects = patch.projects;
        if (patch.settings) next.settings = patch.settings;

        // Shallow-merge fields (by key)
        if (patch.repoInfo) {
          next.repoInfo = { ...state.repoInfo, ...patch.repoInfo };
        }
        if (patch.sessions) {
          next.sessions = { ...state.sessions, ...patch.sessions };
        }
        if (patch.env) {
          next.env = { ...state.env, ...patch.env };
        }
        if (patch.scripts) {
          next.scripts = { ...state.scripts, ...patch.scripts };
        }
        if (patch.scriptStatuses) {
          next.scriptStatuses = { ...state.scriptStatuses, ...patch.scriptStatuses };
        }

        // When projects change, prune orphaned entries from keyed maps
        if (patch.projects) {
          const validWsIds = new Set(patch.projects.flatMap((p) => p.workspaces.map((w) => w.id)));
          const ri = next.repoInfo ?? { ...state.repoInfo };
          const se = next.sessions ?? { ...state.sessions };
          const en = next.env ?? { ...state.env };
          const sc = next.scripts ?? { ...state.scripts };
          const ss = next.scriptStatuses ?? { ...state.scriptStatuses };
          pruneOrphans(validWsIds, ri, se, en, sc, ss);
          next.repoInfo = ri;
          next.sessions = se;
          next.env = en;
          next.scripts = sc;
          next.scriptStatuses = ss;
        }

        return next;
      });
    });

    return unsub;
  },
}));
