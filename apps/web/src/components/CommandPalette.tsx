import { useCallback, useMemo, useState } from "react";
import { Command } from "cmdk";
import { GitBranch, Plus } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAppStore } from "~/stores/app";
import { useActiveSessionStore } from "~/stores/activeSession";
import { CreateWorkspaceDialog } from "~/components/CreateWorkspaceDialog";
import "~/styles/command.css";

export type CommandPaletteMode = "workspaces" | "new-session";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  mode?: CommandPaletteMode;
}

const MODES: CommandPaletteMode[] = ["workspaces", "new-session"];
const MODE_LABELS: Record<CommandPaletteMode, string> = {
  workspaces: "Go to",
  "new-session": "New Session",
};

export function CommandPalette({
  open,
  onClose,
  mode: initialMode = "workspaces",
}: CommandPaletteProps) {
  const projects = useAppStore((s) => s.projects);
  const sessions = useAppStore((s) => s.sessions);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mode, setMode] = useState<CommandPaletteMode>(initialMode);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);

  // Reset mode when palette opens with a new initialMode
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMode(initialMode);
  }

  // Derive current page context from pathname
  const currentWorkspacePath = pathname.startsWith("/workspace/")
    ? pathname.slice("/workspace/".length)
    : null;
  const sortedWorkspaces = useMemo(() => {
    const all = projects.flatMap((project) =>
      project.workspaces.map((ws) => {
        const wsSessions = sessions[ws.id] ?? [];
        const projectSessions = sessions[`project:${project.id}`] ?? [];
        let latest = 0;
        for (const s of [...wsSessions, ...projectSessions]) {
          const t = new Date(s.lastMessageAt).getTime();
          if (t > latest) latest = t;
        }
        return {
          id: ws.id,
          label: `${project.name} / ${ws.name}`,
          value: `${project.name} ${ws.name}`,
          isCurrent: ws.id === currentWorkspacePath,
          lastActivity: latest,
        };
      }),
    );
    return all.toSorted((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastActivity - a.lastActivity;
    });
  }, [projects, sessions, currentWorkspacePath]);

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      useAppStore.getState().selectWorkspace(workspaceId);
      void navigate({ to: `/workspace/${workspaceId}` } as any);
      onClose();
    },
    [navigate, onClose],
  );

  const handleNewSession = useCallback(
    async (workspaceId: string) => {
      useAppStore.getState().selectWorkspace(workspaceId);
      const id = await useActiveSessionStore.getState().create(workspaceId);
      void navigate({ to: "/session/$id", params: { id } } as any);
      onClose();
    },
    [navigate, onClose],
  );

  const handleSelect = useCallback(
    (workspaceId: string) => {
      if (mode === "new-session") {
        void handleNewSession(workspaceId);
      } else {
        handleSelectWorkspace(workspaceId);
      }
    },
    [mode, handleNewSession, handleSelectWorkspace],
  );

  const cycleMode = useCallback((direction: 1 | -1) => {
    setMode((prev) => {
      const idx = MODES.indexOf(prev);
      const next = (idx + direction + MODES.length) % MODES.length;
      return MODES[next]!;
    });
  }, []);

  if (!open && !showCreateWorkspace) return null;

  return (
    <>
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click to close
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[20vh]"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <Command
            className="w-full max-w-xl rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
            label="Command palette"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                cycleMode(-1);
              }
              if (e.key === "ArrowRight") {
                e.preventDefault();
                cycleMode(1);
              }
            }}
          >
            {/* Mode toggle */}
            <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-1.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    mode === m ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
              <span className="ml-auto flex items-center gap-1 text-[10px] text-zinc-600">
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 text-zinc-500">
                  ←
                </kbd>
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 text-zinc-500">
                  →
                </kbd>
                to switch
              </span>
            </div>

            <Command.Input
              placeholder={
                mode === "new-session" ? "Select workspace for new session..." : "Search..."
              }
              className="h-11 w-full border-b border-zinc-800 bg-transparent px-4 text-sm text-zinc-200 placeholder-zinc-500 outline-none"
              autoFocus
            />
            <Command.List className="max-h-80 overflow-y-auto p-1.5">
              <Command.Empty className="px-4 py-6 text-center text-sm text-zinc-500">
                No results found.
              </Command.Empty>

              <Command.Item
                value="New Workspace create"
                onSelect={() => {
                  onClose();
                  setShowCreateWorkspace(true);
                }}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-300 cursor-default"
              >
                <Plus size={14} className="shrink-0 text-zinc-600" />
                <span>New Workspace</span>
              </Command.Item>

              {sortedWorkspaces.map((ws) => (
                <Command.Item
                  key={ws.id}
                  value={ws.value}
                  onSelect={() => handleSelect(ws.id)}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-300 cursor-default"
                >
                  <GitBranch size={14} className="shrink-0 text-zinc-600" />
                  <span>{ws.label}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
      <CreateWorkspaceDialog
        open={showCreateWorkspace}
        onClose={() => setShowCreateWorkspace(false)}
      />
    </>
  );
}
