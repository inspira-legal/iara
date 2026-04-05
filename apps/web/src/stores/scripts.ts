import { create } from "zustand";
import type { EssencialKey, ScriptStatus, ScriptsConfig } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";

const MAX_LOG_LINES = 1000;

type PanelTab = "scripts" | "output" | "terminal" | null;

interface ScriptsState {
  config: ScriptsConfig | null;
  currentWorkspaceId: string | null;
  loading: boolean;
  /** Projects currently running discovery */
  discoveringProjects: Set<string>;
  /** Discovery error per project */
  discoveryErrors: Map<string, string>;
  /** Logs keyed by ScriptStatus.id */
  logs: Map<string, string[]>;
  selectedLog: { service: string; script: string } | null;
  /** Bottom panel UI state — collapsed is derived: activeTab === null */
  activeTab: PanelTab;
  /** Statuses received before config was loaded — applied when config loads */
  pendingStatuses: ScriptStatus[];
}

interface ScriptsActions {
  loadConfig(workspaceId: string): Promise<void>;
  runScript(workspaceId: string, service: string, script: string): Promise<void>;
  stopScript(scriptId: string): Promise<void>;
  runAll(workspaceId: string, category: EssencialKey): Promise<void>;
  stopAll(workspaceId: string): Promise<void>;
  discover(projectId: string): Promise<void>;
  selectLog(service: string, script: string): void;
  fetchLogs(scriptId: string): Promise<void>;
  setActiveTab(tab: PanelTab): void;
  /** Called by the resizable panel when its physical collapsed state changes */
  syncCollapsed(collapsed: boolean): void;
  subscribePush(): () => void;
}

/** Extract the projectId portion from a workspaceId like "projectId/workspaceSlug" */
function projectIdFromWorkspaceId(workspaceId: string | null): string | null {
  if (!workspaceId) return null;
  const idx = workspaceId.indexOf("/");
  return idx >= 0 ? workspaceId.slice(0, idx) : workspaceId;
}

export const useScriptsStore = create<ScriptsState & ScriptsActions>((set, get) => ({
  config: null,
  currentWorkspaceId: null as string | null,
  loading: false,
  discoveringProjects: new Set<string>(),
  pendingStatuses: [],
  discoveryErrors: new Map<string, string>(),
  logs: new Map(),
  selectedLog: null,
  activeTab: null as PanelTab,

  loadConfig: async (workspaceId) => {
    const currentTab = get().activeTab;
    set({
      loading: true,
      selectedLog: null,
      activeTab: currentTab ?? "scripts",
      currentWorkspaceId: workspaceId,
      config: null,
    });
    try {
      const config = await transport.request("scripts.load", { workspaceId });
      // Apply any statuses that arrived before config loaded
      const pending = get().pendingStatuses;
      if (pending.length > 0) {
        const statuses = [...config.statuses];
        for (const status of pending) {
          const wsId = `${status.projectId}/${status.workspace}`;
          if (wsId !== workspaceId) continue;
          const idx = statuses.findIndex((s) => s.scriptId === status.scriptId);
          if (idx >= 0) statuses[idx] = status;
          else statuses.push(status);
        }
        set({ config: { ...config, statuses }, loading: false, pendingStatuses: [] });
      } else {
        set({ config, loading: false });
      }
    } catch {
      set({ loading: false, pendingStatuses: [] });
    }
  },

  runScript: async (workspaceId, service, script) => {
    await transport.request("scripts.run", { workspaceId, service, script });
  },

  stopScript: async (scriptId) => {
    await transport.request("scripts.stop", { scriptId });
  },

  runAll: async (workspaceId, category) => {
    await transport.request("scripts.runAll", { workspaceId, category });
  },

  stopAll: async (workspaceId) => {
    await transport.request("scripts.stopAll", { workspaceId });
  },

  discover: async (projectId) => {
    const next = new Set(get().discoveringProjects);
    next.add(projectId);
    // Clear stale outputs and previous errors if discovering for the current workspace's project
    const currentProject = projectIdFromWorkspaceId(get().currentWorkspaceId);
    const clearState =
      currentProject === projectId ? { config: null, logs: new Map(), selectedLog: null } : {};
    const errors = new Map(get().discoveryErrors);
    errors.delete(projectId);
    set({ discoveringProjects: next, discoveryErrors: errors, ...clearState });
    try {
      await transport.request("scripts.discover", { projectId });
    } catch (err) {
      const cleared = new Set(get().discoveringProjects);
      cleared.delete(projectId);
      const nextErrors = new Map(get().discoveryErrors);
      nextErrors.set(projectId, err instanceof Error ? err.message : String(err));
      set({ discoveringProjects: cleared, discoveryErrors: nextErrors });
    }
  },

  selectLog: (service, script) => {
    set({ selectedLog: { service, script } });
    const config = get().config;
    if (!config) return;
    const status = config.statuses.find((s) => s.service === service && s.script === script);
    if (status && !get().logs.has(status.scriptId)) {
      void get().fetchLogs(status.scriptId);
    }
  },

  fetchLogs: async (scriptId) => {
    try {
      const lines = await transport.request("scripts.logs", { scriptId, limit: 200 });
      const logs = new Map(get().logs);
      logs.set(scriptId, lines);
      set({ logs });
    } catch {
      // transport not ready
    }
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },
  syncCollapsed: (isCollapsed) => {
    if (isCollapsed && get().activeTab !== null) {
      set({ activeTab: null });
    } else if (!isCollapsed && get().activeTab === null) {
      set({ activeTab: "scripts" });
    }
  },

  subscribePush: () => {
    const unsubStatus = transport.subscribe(
      "scripts:status",
      ({ status }: { service: string; script: string; status: ScriptStatus }) => {
        const { config, currentWorkspaceId } = get();
        if (!config) {
          // Queue for when config loads
          set({ pendingStatuses: [...get().pendingStatuses, status] });
          return;
        }
        // Ignore statuses from other workspaces
        const statusWorkspaceId = `${status.projectId}/${status.workspace}`;
        if (statusWorkspaceId !== currentWorkspaceId) return;
        const existing = config.statuses.findIndex((s) => s.scriptId === status.scriptId);
        if (existing >= 0) {
          const prev = config.statuses[existing]!;
          if (
            prev.health === status.health &&
            prev.pid === status.pid &&
            prev.exitCode === status.exitCode
          ) {
            return;
          }
        }
        const next = [...config.statuses];
        let staleScriptId: string | null = null;
        if (existing >= 0) {
          const prev = config.statuses[existing]!;
          if (prev.scriptId !== status.scriptId) {
            staleScriptId = prev.scriptId;
          }
          next[existing] = status;
        } else {
          next.push(status);
        }
        if (staleScriptId) {
          const logs = new Map(get().logs);
          logs.delete(staleScriptId);
          set({ config: { ...config, statuses: next }, logs });
        } else {
          set({ config: { ...config, statuses: next } });
        }
      },
    );

    const unsubLog = transport.subscribe(
      "scripts:log",
      ({ scriptId, line }: { scriptId: string; service: string; script: string; line: string }) => {
        const key = scriptId;
        const logs = new Map(get().logs);
        const existing = logs.get(key) ?? [];
        logs.set(key, [...existing.slice(-(MAX_LOG_LINES - 1)), line]);
        set({ logs });
      },
    );

    const unsubDiscovering = transport.subscribe(
      "scripts:discovering",
      ({ projectId }: { projectId: string }) => {
        const next = new Set(get().discoveringProjects);
        next.add(projectId);
        set({ discoveringProjects: next });
      },
    );

    const unsubReload = transport.subscribe("scripts:reload", ({ projectId }) => {
      const next = new Set(get().discoveringProjects);
      next.delete(projectId);
      const errors = new Map(get().discoveryErrors);
      errors.delete(projectId);
      set({ discoveringProjects: next, discoveryErrors: errors });
    });

    return () => {
      unsubStatus();
      unsubLog();
      unsubDiscovering();
      unsubReload();
    };
  },
}));

/** Derived selector: is the current workspace's project being discovered? */
export function useIsDiscovering(): boolean {
  const discoveringProjects = useScriptsStore((s) => s.discoveringProjects);
  const currentWorkspaceId = useScriptsStore((s) => s.currentWorkspaceId);
  const projectId = projectIdFromWorkspaceId(currentWorkspaceId);
  return projectId ? discoveringProjects.has(projectId) : false;
}

/** Derived selector: discovery error for the current workspace's project */
export function useDiscoveryError(): string | null {
  const discoveryErrors = useScriptsStore((s) => s.discoveryErrors);
  const currentWorkspaceId = useScriptsStore((s) => s.currentWorkspaceId);
  const projectId = projectIdFromWorkspaceId(currentWorkspaceId);
  return projectId ? (discoveryErrors.get(projectId) ?? null) : null;
}
