import { create } from "zustand";
import { transport } from "../lib/ws-transport.js";

export type ShellStatus = "idle" | "connecting" | "active" | "exited";

export interface ShellEntry {
  id: string;
  sessionEntryId: string;
  workspaceId: string;
  terminalId: string | null;
  status: ShellStatus;
  exitCode: number | null;
  title: string | null;
}

interface ShellState {
  shells: ShellEntry[];
  activeId: string | null;
}

interface ShellActions {
  addShell(sessionEntryId: string, workspaceId: string): string;
  removeShell(id: string): void;
  destroyBySessionEntryId(sessionEntryId: string): void;
  updateShell(id: string, updates: Partial<ShellEntry>): void;
  setActiveId(id: string | null): void;
}

export const useShellStore = create<ShellState & ShellActions>((set, get) => ({
  shells: [],
  activeId: null,

  addShell: (sessionEntryId, workspaceId) => {
    const id = crypto.randomUUID();
    set((s) => ({
      shells: [
        ...s.shells,
        {
          id,
          sessionEntryId,
          workspaceId,
          terminalId: null,
          status: "idle",
          exitCode: null,
          title: null,
        },
      ],
      activeId: id,
    }));
    return id;
  },

  removeShell: (id) => {
    const { shells, activeId } = get();
    const idx = shells.findIndex((s) => s.id === id);
    if (idx < 0) return;

    const shell = shells[idx]!;
    if (shell.terminalId) {
      transport.request("terminal.destroy", { terminalId: shell.terminalId }).catch(() => {});
    }

    const next = shells.filter((s) => s.id !== id);
    let nextActiveId = activeId;
    if (activeId === id) {
      const adjacent = next[Math.min(idx, next.length - 1)] ?? null;
      nextActiveId = adjacent?.id ?? null;
    }
    set({ shells: next, activeId: nextActiveId });
  },

  destroyBySessionEntryId: (sessionEntryId) => {
    const { shells, activeId } = get();
    const matched = shells.filter((s) => s.sessionEntryId === sessionEntryId);
    if (matched.length === 0) return;

    for (const shell of matched) {
      if (shell.terminalId) {
        transport.request("terminal.destroy", { terminalId: shell.terminalId }).catch(() => {});
      }
    }

    const next = shells.filter((s) => s.sessionEntryId !== sessionEntryId);
    const nextActiveId = matched.some((s) => s.id === activeId) ? null : activeId;
    set({ shells: next, activeId: nextActiveId });
  },

  updateShell: (id, updates) => {
    set((s) => ({
      shells: s.shells.map((shell) => (shell.id === id ? { ...shell, ...updates } : shell)),
    }));
  },

  setActiveId: (id) => set({ activeId: id }),
}));

// Global subscription for terminal exit events on shell terminals
transport.subscribe(
  "terminal:exit",
  ({ terminalId, exitCode }: { terminalId: string; exitCode: number }) => {
    const { shells } = useShellStore.getState();
    const shell = shells.find((s) => s.terminalId === terminalId);
    if (shell) {
      useShellStore.getState().updateShell(shell.id, { status: "exited", exitCode });
    }
  },
);
