import { create } from "zustand";
import type { EssencialKey, ScriptStatus, ScriptsConfig } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";

const MAX_LOG_LINES = 1000;

export type PanelTab = "scripts" | "output" | null;

interface ScriptsState {
  config: ScriptsConfig | null;
  currentWorkspaceId: string | null;
  loading: boolean;
  /** Projects currently running discovery */
  discoveringProjects: Set<string>;
  /** Logs keyed by ScriptStatus.id */
  logs: Map<string, string[]>;
  selectedLog: { service: string; script: string } | null;
  /** Bottom panel UI state */
  activeTab: PanelTab;
  collapsed: boolean;
}

interface ScriptsActions {
  loadConfig(workspaceId: string): Promise<void>;
  runScript(workspaceId: string, service: string, script: string): Promise<void>;
  stopScript(scriptId: string): Promise<void>;
  runAll(workspaceId: string, category: EssencialKey): Promise<void>;
  stopAll(): Promise<void>;
  discover(projectId: string): Promise<void>;
  selectLog(service: string, script: string): void;
  fetchLogs(scriptId: string): Promise<void>;
  setActiveTab(tab: PanelTab): void;
  setCollapsed(collapsed: boolean): void;
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
  logs: new Map(),
  selectedLog: null,
  activeTab: null,
  collapsed: false,

  loadConfig: async (workspaceId) => {
    set({
      loading: true,
      selectedLog: null,
      activeTab: "scripts",
      currentWorkspaceId: workspaceId,
    });
    try {
      const config = await transport.request("scripts.load", { workspaceId });
      set({ config, loading: false });
    } catch {
      set({ loading: false });
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

  stopAll: async () => {
    await transport.request("scripts.stopAll", {});
  },

  discover: async (projectId) => {
    const next = new Set(get().discoveringProjects);
    next.add(projectId);
    set({ discoveringProjects: next });
    try {
      await transport.request("scripts.discover", { projectId });
    } catch {
      const cleared = new Set(get().discoveringProjects);
      cleared.delete(projectId);
      set({ discoveringProjects: cleared });
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

  setActiveTab: (tab) => set({ activeTab: tab }),
  setCollapsed: (collapsed) => set({ collapsed, ...(collapsed ? { activeTab: null } : {}) }),

  subscribePush: () => {
    const unsubStatus = transport.subscribe(
      "scripts:status",
      ({ status }: { service: string; script: string; status: ScriptStatus }) => {
        const { config, currentWorkspaceId } = get();
        if (!config) return;
        // Ignore statuses from other workspaces
        // status.projectId is the full workspaceId (e.g. "project/default")
        if (status.projectId !== currentWorkspaceId) return;
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
        if (existing >= 0) {
          next[existing] = status;
        } else {
          next.push(status);
        }
        set({ config: { ...config, statuses: next } });
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

    const unsubReload = transport.subscribe("scripts:reload", ({ projectId }) => {
      const next = new Set(get().discoveringProjects);
      next.delete(projectId);
      set({ discoveringProjects: next });
    });

    return () => {
      unsubStatus();
      unsubLog();
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
