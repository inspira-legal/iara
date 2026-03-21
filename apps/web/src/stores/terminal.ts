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
  getEntry(workspaceId: string): TerminalEntry;
  create(workspaceId: string, resumeSessionId?: string, sessionCwd?: string): Promise<void>;
  restart(workspaceId: string): Promise<void>;
  destroy(workspaceId: string): Promise<void>;
  resetToSessions(workspaceId: string): void;
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

  getEntry: (workspaceId) => get().entries.get(workspaceId) ?? DEFAULT_ENTRY,

  create: async (workspaceId, resumeSessionId?, sessionCwd?) => {
    set((state) => {
      const next = new Map(state.entries);
      next.set(workspaceId, { ...DEFAULT_ENTRY, status: "connecting" });
      return { entries: next };
    });
    try {
      const params: { workspaceId: string; resumeSessionId?: string; sessionCwd?: string } = {
        workspaceId,
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
        next.set(workspaceId, {
          terminalId: result.terminalId,
          sessionId: result.sessionId,
          status: "active",
          exitCode: null,
        });
        return { entries: next };
      });
      // Invalidate session list so it picks up the new session
      useSessionStore.getState().invalidateWorkspace(workspaceId);
    } catch (err) {
      console.error("Failed to create terminal:", err);
      set((state) => {
        const next = new Map(state.entries);
        next.set(workspaceId, { ...DEFAULT_ENTRY, status: "exited", exitCode: -1 });
        return { entries: next };
      });
    }
  },

  restart: async (workspaceId) => {
    const entry = get().entries.get(workspaceId);
    const prevSessionId = entry?.sessionId ?? undefined;
    if (entry?.terminalId) {
      try {
        await transport.request("terminal.destroy", { terminalId: entry.terminalId });
      } catch {
        // ignore
      }
    }
    await get().create(workspaceId, prevSessionId);
  },

  destroy: async (workspaceId) => {
    const entry = get().entries.get(workspaceId);
    if (entry?.terminalId) {
      try {
        await transport.request("terminal.destroy", { terminalId: entry.terminalId });
      } catch {
        // ignore
      }
    }
    set((state) => {
      const next = new Map(state.entries);
      next.delete(workspaceId);
      return { entries: next };
    });
  },

  resetToSessions: (workspaceId) => {
    const entry = get().entries.get(workspaceId);
    if (entry?.terminalId) {
      transport.request("terminal.destroy", { terminalId: entry.terminalId }).catch(() => {});
    }
    set((state) => {
      const next = new Map(state.entries);
      next.delete(workspaceId);
      return { entries: next };
    });
    useSessionStore.getState().invalidateWorkspace(workspaceId);
  },

  handleExit: (terminalId, exitCode) => {
    set((state) => {
      const next = new Map(state.entries);
      for (const [wsId, entry] of next) {
        if (entry.terminalId === terminalId) {
          if (exitCode === 0) {
            next.delete(wsId);
            useSessionStore.getState().invalidateWorkspace(wsId);
          } else {
            next.set(wsId, { ...entry, status: "exited", exitCode, terminalId: null });
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
