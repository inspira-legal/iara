import { create } from "zustand";
import type { SessionInfo } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";

interface SessionState {
  sessionsByWorkspace: Map<string, SessionInfo[]>;
  sessionsByProject: Map<string, SessionInfo[]>;
  loading: Map<string, boolean>;
}

interface SessionActions {
  loadForWorkspace(workspaceId: string): Promise<void>;
  loadForProject(projectId: string): Promise<void>;
  getForWorkspace(workspaceId: string): SessionInfo[];
  getForProject(projectId: string): SessionInfo[];
  isLoading(key: string): boolean;
  invalidateWorkspace(workspaceId: string): void;
}

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  sessionsByWorkspace: new Map(),
  sessionsByProject: new Map(),
  loading: new Map(),

  loadForWorkspace: async (workspaceId) => {
    set((state) => {
      const next = new Map(state.loading);
      next.set(`ws:${workspaceId}`, true);
      return { loading: next };
    });
    try {
      const sessions = await transport.request("sessions.list", { workspaceId });
      set((state) => {
        const nextSessions = new Map(state.sessionsByWorkspace);
        nextSessions.set(workspaceId, sessions);
        const nextLoading = new Map(state.loading);
        nextLoading.set(`ws:${workspaceId}`, false);
        return { sessionsByWorkspace: nextSessions, loading: nextLoading };
      });
    } catch {
      set((state) => {
        const nextSessions = new Map(state.sessionsByWorkspace);
        nextSessions.set(workspaceId, []);
        const nextLoading = new Map(state.loading);
        nextLoading.set(`ws:${workspaceId}`, false);
        return { sessionsByWorkspace: nextSessions, loading: nextLoading };
      });
    }
  },

  loadForProject: async (projectId) => {
    set((state) => {
      const next = new Map(state.loading);
      next.set(`project:${projectId}`, true);
      return { loading: next };
    });
    try {
      const sessions = await transport.request("sessions.listByProject", { projectId });
      set((state) => {
        const nextSessions = new Map(state.sessionsByProject);
        nextSessions.set(projectId, sessions);
        const nextLoading = new Map(state.loading);
        nextLoading.set(`project:${projectId}`, false);
        return { sessionsByProject: nextSessions, loading: nextLoading };
      });
    } catch {
      set((state) => {
        const nextSessions = new Map(state.sessionsByProject);
        nextSessions.set(projectId, []);
        const nextLoading = new Map(state.loading);
        nextLoading.set(`project:${projectId}`, false);
        return { sessionsByProject: nextSessions, loading: nextLoading };
      });
    }
  },

  getForWorkspace: (workspaceId) => get().sessionsByWorkspace.get(workspaceId) ?? [],

  getForProject: (projectId) => get().sessionsByProject.get(projectId) ?? [],

  isLoading: (key) => get().loading.get(key) ?? false,

  invalidateWorkspace: (workspaceId) => {
    void get().loadForWorkspace(workspaceId);
  },
}));

// Auto-refresh sessions when server detects file changes
transport.subscribe("session:changed", ({ workspaceId }: { workspaceId: string }) => {
  useSessionStore.getState().invalidateWorkspace(workspaceId);
});
