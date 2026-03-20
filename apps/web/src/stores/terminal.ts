import { create } from "zustand";
import { transport } from "../lib/ws-transport.js";
import { useSessionStore } from "./sessions.js";

export type TerminalStatus = "idle" | "connecting" | "active" | "exited";

interface TerminalEntry {
  terminalId: string | null;
  sessionId: string | null;
  status: TerminalStatus;
  exitCode: number | null;
}

interface TerminalState {
  entries: Map<string, TerminalEntry>;
}

interface TerminalActions {
  getEntry(taskId: string): TerminalEntry;
  create(taskId: string, resumeSessionId?: string, sessionCwd?: string): Promise<void>;
  createRoot(projectId: string, resumeSessionId?: string, sessionCwd?: string): Promise<void>;
  restart(taskId: string): Promise<void>;
  destroy(taskId: string): Promise<void>;
  resetToSessions(taskId: string): void;
  handleExit(terminalId: string, exitCode: number): void;
}

const DEFAULT_ENTRY: TerminalEntry = {
  terminalId: null,
  sessionId: null,
  status: "idle",
  exitCode: null,
};

export const useTerminalStore = create<TerminalState & TerminalActions>((set, get) => ({
  entries: new Map(),

  getEntry: (taskId) => get().entries.get(taskId) ?? DEFAULT_ENTRY,

  create: async (taskId, resumeSessionId?, sessionCwd?) => {
    set((state) => {
      const next = new Map(state.entries);
      next.set(taskId, { ...DEFAULT_ENTRY, status: "connecting" });
      return { entries: next };
    });
    try {
      const params: { taskId: string; resumeSessionId?: string; sessionCwd?: string } = { taskId };
      if (resumeSessionId !== undefined) {
        params.resumeSessionId = resumeSessionId;
      }
      if (sessionCwd !== undefined) {
        params.sessionCwd = sessionCwd;
      }
      const result = await transport.request("terminal.create", params);
      set((state) => {
        const next = new Map(state.entries);
        next.set(taskId, {
          terminalId: result.terminalId,
          sessionId: result.sessionId,
          status: "active",
          exitCode: null,
        });
        return { entries: next };
      });
      // Invalidate session list so it picks up the new session
      useSessionStore.getState().invalidateTask(taskId);
    } catch (err) {
      console.error("Failed to create terminal:", err);
      set((state) => {
        const next = new Map(state.entries);
        next.set(taskId, { ...DEFAULT_ENTRY, status: "exited", exitCode: -1 });
        return { entries: next };
      });
    }
  },

  createRoot: async (projectId, resumeSessionId?, sessionCwd?) => {
    const key = `root:${projectId}`;
    set((state) => {
      const next = new Map(state.entries);
      next.set(key, { ...DEFAULT_ENTRY, status: "connecting" });
      return { entries: next };
    });
    try {
      const params: {
        projectId: string;
        root: true;
        resumeSessionId?: string;
        sessionCwd?: string;
      } = {
        projectId,
        root: true,
      };
      if (resumeSessionId !== undefined) {
        params.resumeSessionId = resumeSessionId;
      }
      if (sessionCwd !== undefined) {
        params.sessionCwd = sessionCwd;
      }
      const result = await transport.request("terminal.create", params);
      set((state) => {
        const next = new Map(state.entries);
        next.set(key, {
          terminalId: result.terminalId,
          sessionId: result.sessionId,
          status: "active",
          exitCode: null,
        });
        return { entries: next };
      });
      // Sessions will refresh on next view
    } catch (err) {
      console.error("Failed to create root terminal:", err);
      set((state) => {
        const next = new Map(state.entries);
        next.set(key, { ...DEFAULT_ENTRY, status: "exited", exitCode: -1 });
        return { entries: next };
      });
    }
  },

  restart: async (taskId) => {
    const entry = get().entries.get(taskId);
    const prevSessionId = entry?.sessionId ?? undefined;
    // Destroy current terminal
    if (entry?.terminalId) {
      try {
        await transport.request("terminal.destroy", { terminalId: entry.terminalId });
      } catch {
        // ignore
      }
    }
    // Create new one, resuming the session
    await get().create(taskId, prevSessionId);
  },

  destroy: async (taskId) => {
    const entry = get().entries.get(taskId);
    if (entry?.terminalId) {
      try {
        await transport.request("terminal.destroy", { terminalId: entry.terminalId });
      } catch {
        // ignore
      }
    }
    set((state) => {
      const next = new Map(state.entries);
      next.delete(taskId);
      return { entries: next };
    });
  },

  resetToSessions: (taskId) => {
    // User explicitly clicked back — clear terminal state for this task
    const entry = get().entries.get(taskId);
    if (entry?.terminalId) {
      transport.request("terminal.destroy", { terminalId: entry.terminalId }).catch(() => {});
    }
    set((state) => {
      const next = new Map(state.entries);
      next.delete(taskId);
      return { entries: next };
    });
    // Refresh session list
    useSessionStore.getState().invalidateTask(taskId);
  },

  handleExit: (terminalId, exitCode) => {
    set((state) => {
      const next = new Map(state.entries);
      for (const [taskId, entry] of next) {
        if (entry.terminalId === terminalId) {
          if (exitCode === 0) {
            // Clean exit — go back to sessions screen
            next.delete(taskId);
            useSessionStore.getState().invalidateTask(taskId);
          } else {
            next.set(taskId, { ...entry, status: "exited", exitCode, terminalId: null });
          }
          break;
        }
      }
      return { entries: next };
    });
  },
}));

// Global subscription for terminal exit events
transport.subscribe(
  "terminal:exit",
  ({ terminalId, exitCode }: { terminalId: string; exitCode: number }) => {
    useTerminalStore.getState().handleExit(terminalId, exitCode);
  },
);
