import { create } from "zustand";
import type { SessionInfo } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";

interface SessionState {
  sessionsByTask: Map<string, SessionInfo[]>;
  sessionsByProject: Map<string, SessionInfo[]>;
  loading: Map<string, boolean>;
}

interface SessionActions {
  loadForTask(taskId: string): Promise<void>;
  loadForProject(projectId: string): Promise<void>;
  getForTask(taskId: string): SessionInfo[];
  getForProject(projectId: string): SessionInfo[];
  isLoading(key: string): boolean;
  invalidateTask(taskId: string): void;
}

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  sessionsByTask: new Map(),
  sessionsByProject: new Map(),
  loading: new Map(),

  loadForTask: async (taskId) => {
    set((state) => {
      const next = new Map(state.loading);
      next.set(`task:${taskId}`, true);
      return { loading: next };
    });
    try {
      const sessions = await transport.request("sessions.list", { taskId });
      set((state) => {
        const nextSessions = new Map(state.sessionsByTask);
        nextSessions.set(taskId, sessions);
        const nextLoading = new Map(state.loading);
        nextLoading.set(`task:${taskId}`, false);
        return { sessionsByTask: nextSessions, loading: nextLoading };
      });
    } catch {
      set((state) => {
        const nextSessions = new Map(state.sessionsByTask);
        nextSessions.set(taskId, []);
        const nextLoading = new Map(state.loading);
        nextLoading.set(`task:${taskId}`, false);
        return { sessionsByTask: nextSessions, loading: nextLoading };
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

  getForTask: (taskId) => get().sessionsByTask.get(taskId) ?? [],

  getForProject: (projectId) => get().sessionsByProject.get(projectId) ?? [],

  isLoading: (key) => get().loading.get(key) ?? false,

  invalidateTask: (taskId) => {
    // Reload sessions for this task
    void get().loadForTask(taskId);
  },
}));

// Auto-refresh sessions when server detects file changes
transport.subscribe("session:changed", ({ taskId }: { taskId: string }) => {
  useSessionStore.getState().invalidateTask(taskId);
});
