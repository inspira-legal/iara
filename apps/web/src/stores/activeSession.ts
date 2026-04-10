import { create } from "zustand";
import { transport } from "../lib/ws-transport.js";
import { LocalCache } from "../lib/local-cache.js";
import { PersistedSessionsSchema, type PersistedSession } from "../lib/cache-schemas.js";
import { useAppStore } from "./app.js";
import { useScriptsStore } from "./scripts.js";
import { useShellStore } from "./shell.js";

const sessionsCache = new LocalCache({
  key: "iara:sessions",
  version: 1,
  schema: PersistedSessionsSchema,
});

export type ActiveSessionStatus = "idle" | "connecting" | "active" | "exited";

export interface ActiveSessionEntry {
  id: string;
  workspaceId: string;
  terminalId: string | null;
  sessionId: string | null;
  status: ActiveSessionStatus;
  exitCode: number | null;
  errorCode: string | null;
  hasData: boolean;
  initialPrompt: string | null;
  title: string | null;
  /** True when this session was created via --resume (restore on reopen). */
  isResume: boolean;
}

interface ActiveSessionState {
  entries: Map<string, ActiveSessionEntry>;
}

interface ActiveSessionActions {
  getEntry(id: string): ActiveSessionEntry;
  orderedEntries(): ActiveSessionEntry[];
  create(
    workspaceId: string,
    opts?: {
      initialPrompt?: string;
      resumeSessionId?: string;
      sessionCwd?: string;
      title?: string;
    },
  ): Promise<string>;
  restart(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  restore(): void;
  resetToSessions(id: string): void;
  handleExit(terminalId: string, exitCode: number): void;
  updateTitle(sessionId: string, title: string): void;
  renameSession(entryId: string, title: string): Promise<void>;
}

const DEFAULT_ENTRY: ActiveSessionEntry = {
  id: "",
  workspaceId: "",
  terminalId: null,
  sessionId: null,
  status: "idle",
  exitCode: null,
  errorCode: null,
  hasData: false,
  initialPrompt: null,
  title: null,
  isResume: false,
};

function persistSessions(): void {
  const entries = useActiveSessionStore.getState().entries;
  const persisted: PersistedSession[] = [];
  for (const entry of entries.values()) {
    if (entry.sessionId && entry.status !== "exited") {
      persisted.push({
        id: entry.id,
        workspaceId: entry.workspaceId,
        sessionId: entry.sessionId,
        title: entry.title,
      });
    }
  }
  sessionsCache.set(persisted);
}

function invalidateSessions(_workspaceId: string): void {
  // Sessions are now pushed via state:patch from the server — no client-side refetch needed.
}

/** Destroy shell terminals for a specific session entry. */
function cleanupSessionShells(sessionEntryId: string): void {
  useShellStore.getState().destroyBySessionEntryId(sessionEntryId);
}

/** Stop all scripts when no active sessions remain for a workspace. */
function cleanupWorkspaceIfEmpty(workspaceId: string): void {
  const entries = useActiveSessionStore.getState().entries;
  const hasRemaining = [...entries.values()].some((e) => e.workspaceId === workspaceId);
  if (hasRemaining) return;
  void useScriptsStore.getState().stopAll(workspaceId);
}

export const useActiveSessionStore = create<ActiveSessionState & ActiveSessionActions>(
  (set, get) => ({
    entries: new Map(),

    getEntry: (id) => get().entries.get(id) ?? DEFAULT_ENTRY,

    orderedEntries: () => [...get().entries.values()],

    restore: () => {
      const saved = sessionsCache.get();
      if (!saved || saved.length === 0) return;

      // Restore sessions sequentially to avoid spawning many processes at once
      const restoreSequentially = async () => {
        for (const s of saved) {
          const createOpts: { resumeSessionId: string; title?: string } = {
            resumeSessionId: s.sessionId,
          };
          if (s.title) createOpts.title = s.title;
          await get().create(s.workspaceId, createOpts);
        }
      };
      void restoreSequentially();
      // Clear cache — create() will persist fresh entries once connected
      sessionsCache.clear();
    },

    create: async (workspaceId, opts?) => {
      const id = crypto.randomUUID();
      set((state) => {
        const next = new Map(state.entries);
        next.set(id, {
          ...DEFAULT_ENTRY,
          id,
          workspaceId,
          status: "connecting",
          initialPrompt: opts?.initialPrompt ?? null,
          title: opts?.title ?? null,
          isResume: opts?.resumeSessionId !== undefined,
        });
        return { entries: next };
      });
      try {
        const params: {
          workspaceId: string;
          resumeSessionId?: string;
          sessionCwd?: string;
          initialPrompt?: string;
        } = {
          workspaceId,
        };
        if (opts?.resumeSessionId !== undefined) {
          params.resumeSessionId = opts.resumeSessionId;
        }
        if (opts?.sessionCwd !== undefined) {
          params.sessionCwd = opts.sessionCwd;
        }
        if (opts?.initialPrompt !== undefined) {
          params.initialPrompt = opts.initialPrompt;
        }
        const result = await transport.request("terminal.create", params);
        set((state) => {
          const next = new Map(state.entries);
          const existing = next.get(id);
          next.set(id, {
            id,
            workspaceId,
            terminalId: result.terminalId,
            sessionId: result.sessionId,
            status: "active",
            exitCode: null,
            errorCode: null,
            hasData: false,
            initialPrompt: existing?.initialPrompt ?? null,
            title: existing?.title ?? null,
            isResume: existing?.isResume ?? false,
          });
          return { entries: next };
        });
        // Fetch session title if resuming an existing session
        if (result.sessionId) {
          const sessions = useAppStore.getState().getSessions(workspaceId);
          const match = sessions.find((s) => s.id === result.sessionId);
          if (match?.title) {
            get().updateTitle(result.sessionId!, match.title);
          }
        }
        // Invalidate session list so it picks up the new session
        invalidateSessions(workspaceId);
        persistSessions();
      } catch (err) {
        console.error("Failed to create terminal:", err);
        const errorCode =
          err instanceof Error && (err as any).code === "CLAUDE_NOT_AVAILABLE"
            ? "CLAUDE_NOT_AVAILABLE"
            : null;
        set((state) => {
          const next = new Map(state.entries);
          next.set(id, {
            ...DEFAULT_ENTRY,
            id,
            workspaceId,
            status: "exited",
            exitCode: -1,
            errorCode,
          });
          return { entries: next };
        });
      }
      return id;
    },

    restart: async (id) => {
      const entry = get().entries.get(id);
      const prevSessionId = entry?.sessionId ?? undefined;
      const workspaceId = entry?.workspaceId ?? "";
      if (entry?.terminalId) {
        try {
          await transport.request("terminal.destroy", { terminalId: entry.terminalId });
        } catch {
          // ignore
        }
      }
      // Remove old entry and create new one under same id slot
      set((state) => {
        const next = new Map(state.entries);
        next.delete(id);
        return { entries: next };
      });
      await get().create(
        workspaceId,
        prevSessionId !== undefined ? { resumeSessionId: prevSessionId } : undefined,
      );
    },

    destroy: async (id) => {
      const entry = get().entries.get(id);
      if (entry?.terminalId) {
        try {
          await transport.request("terminal.destroy", { terminalId: entry.terminalId });
        } catch {
          // ignore
        }
      }
      const workspaceId = entry?.workspaceId;
      set((state) => {
        const next = new Map(state.entries);
        next.delete(id);
        return { entries: next };
      });
      cleanupSessionShells(id);
      persistSessions();
      if (workspaceId) {
        cleanupWorkspaceIfEmpty(workspaceId);
      }
    },

    resetToSessions: (id) => {
      const entry = get().entries.get(id);
      const workspaceId = entry?.workspaceId ?? "";
      if (entry?.terminalId) {
        transport.request("terminal.destroy", { terminalId: entry.terminalId }).catch(() => {});
      }
      set((state) => {
        const next = new Map(state.entries);
        next.delete(id);
        return { entries: next };
      });
      persistSessions();
      if (workspaceId) {
        invalidateSessions(workspaceId);
      }
    },

    handleExit: (terminalId, exitCode) => {
      // Find the entry for this terminal before mutating state
      let failedResumeEntry: { id: string; workspaceId: string } | null = null;
      const entries = get().entries;
      for (const entry of entries.values()) {
        if (entry.terminalId === terminalId && exitCode !== 0 && entry.isResume) {
          // Resume failed (session no longer exists) — will retry as fresh session
          failedResumeEntry = { id: entry.id, workspaceId: entry.workspaceId };
          break;
        }
      }

      // If resume failed, retry as a fresh session
      if (failedResumeEntry) {
        const { id, workspaceId } = failedResumeEntry;
        set((state) => {
          const next = new Map(state.entries);
          next.delete(id);
          return { entries: next };
        });
        cleanupSessionShells(id);
        persistSessions();
        void get().create(workspaceId);
        return;
      }

      let removedEntryId: string | null = null;
      let removedWorkspaceId: string | null = null;
      set((state) => {
        const next = new Map(state.entries);
        for (const [entryId, entry] of next) {
          if (entry.terminalId === terminalId) {
            if (exitCode === 0) {
              next.delete(entryId);
              invalidateSessions(entry.workspaceId);
              removedEntryId = entryId;
              removedWorkspaceId = entry.workspaceId;
            } else {
              next.set(entryId, { ...entry, status: "exited", exitCode, terminalId: null });
            }
            break;
          }
        }
        return { entries: next };
      });
      persistSessions();
      if (removedEntryId) {
        cleanupSessionShells(removedEntryId);
      }
      if (removedWorkspaceId) {
        cleanupWorkspaceIfEmpty(removedWorkspaceId);
      }
    },

    updateTitle: (sessionId, title) => {
      set((state) => {
        const next = new Map(state.entries);
        for (const [entryId, entry] of next) {
          if (entry.sessionId === sessionId) {
            next.set(entryId, { ...entry, title });
            break;
          }
        }
        return { entries: next };
      });
      persistSessions();
    },

    renameSession: async (entryId, title) => {
      const entry = get().entries.get(entryId);
      if (!entry?.sessionId) return;
      await transport.request("sessions.rename", {
        workspaceId: entry.workspaceId,
        sessionId: entry.sessionId,
        title,
      });
      get().updateTitle(entry.sessionId, title);
    },
  }),
);

// Global subscription for terminal exit events
transport.subscribe(
  "terminal:exit",
  ({ terminalId, exitCode }: { terminalId: string; exitCode: number }) => {
    useActiveSessionStore.getState().handleExit(terminalId, exitCode);
  },
);

transport.subscribe("terminal:data", ({ terminalId }: { terminalId: string }) => {
  useActiveSessionStore.setState((s) => {
    for (const [entryId, entry] of s.entries) {
      if (entry.terminalId === terminalId) {
        if (!entry.hasData) {
          const next = new Map(s.entries);
          next.set(entryId, { ...entry, hasData: true });
          return { entries: next };
        }
        break;
      }
    }
    return s;
  });
});

// Update session ID when Claude creates a new session (e.g. after /clear)
transport.subscribe(
  "session:updated",
  ({ terminalId, sessionId }: { terminalId: string; sessionId: string }) => {
    useActiveSessionStore.setState((s) => {
      for (const [entryId, entry] of s.entries) {
        if (entry.terminalId === terminalId && entry.sessionId !== sessionId) {
          const next = new Map(s.entries);
          next.set(entryId, { ...entry, sessionId });
          return { entries: next };
        }
      }
      return s;
    });
    persistSessions();
  },
);

// Sync session titles when server pushes updated sessions via state:patch.
// Deferred to avoid circular import: app.ts imports activeSession.ts and vice versa.
queueMicrotask(() => {
  useAppStore.subscribe((state, prev) => {
    if (state.sessions === prev.sessions) return;
    const entries = useActiveSessionStore.getState().entries;
    for (const [wsId, sessions] of Object.entries(state.sessions)) {
      const hasActiveEntries = [...entries.values()].some((e) => e.workspaceId === wsId);
      if (!hasActiveEntries) continue;
      for (const session of sessions) {
        if (session.title) {
          useActiveSessionStore.getState().updateTitle(session.id, session.title);
        }
      }
    }
  });
});
