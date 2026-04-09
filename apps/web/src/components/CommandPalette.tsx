import { useCallback, useMemo, useState } from "react";
import { Command } from "cmdk";
import { FolderOpen, FolderPlus, GitBranch } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAppStore } from "~/stores/app";
import { useActiveSessionStore } from "~/stores/activeSession";
import "~/styles/command.css";

export type CommandPaletteMode = "workspaces" | "new-session";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onCreateProject?: () => void;
  mode?: CommandPaletteMode;
}

const MODES: CommandPaletteMode[] = ["workspaces", "new-session"];
const MODE_LABELS: Record<CommandPaletteMode, string> = {
  workspaces: "Go to",
  "new-session": "New Chat",
};

export function CommandPalette({
  open,
  onClose,
  onCreateProject,
  mode: initialMode = "workspaces",
}: CommandPaletteProps) {
  const projects = useAppStore((s) => s.projects);
  const navigate = useNavigate();
  const [mode, setMode] = useState<CommandPaletteMode>(initialMode);

  // Reset mode when palette opens with a new initialMode
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMode(initialMode);
  }

  const sortedItems = useMemo(() => {
    type Item = {
      kind: "project" | "workspace";
      id: string;
      label: string;
      value: string;
    };
    const items: Item[] = [];
    const sorted = projects.toSorted((a, b) => a.name.localeCompare(b.name));

    for (const project of sorted) {
      items.push({
        kind: "project",
        id: project.id,
        label: project.name,
        value: project.name,
      });

      // Main workspace first, then others alphabetically
      const main = project.workspaces.find((ws) => ws.slug === "main");
      const others = project.workspaces
        .filter((ws) => ws.slug !== "main")
        .toSorted((a, b) => a.name.localeCompare(b.name));

      for (const ws of main ? [main, ...others] : others) {
        items.push({
          kind: "workspace",
          id: ws.id,
          label: `${project.name} / ${ws.name}`,
          value: `${project.name} ${ws.name}`,
        });
      }
    }

    return items;
  }, [projects]);

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      useAppStore.getState().selectWorkspace(workspaceId);
      void navigate({ to: "/workspace/$", params: { _splat: workspaceId } } as any);
      onClose();
    },
    [navigate, onClose],
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      void navigate({ to: "/project/$", params: { _splat: projectId } } as any);
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
    (item: { kind: "project" | "workspace"; id: string }) => {
      if (item.kind === "project") {
        handleSelectProject(item.id);
      } else if (mode === "new-session") {
        void handleNewSession(item.id);
      } else {
        handleSelectWorkspace(item.id);
      }
    },
    [mode, handleNewSession, handleSelectWorkspace, handleSelectProject],
  );

  const cycleMode = useCallback((direction: 1 | -1) => {
    setMode((prev) => {
      const idx = MODES.indexOf(prev);
      const next = (idx + direction + MODES.length) % MODES.length;
      return MODES[next]!;
    });
  }, []);

  if (!open) return null;

  const hasProjects = projects.length > 0;
  const visibleItems =
    mode === "new-session" ? sortedItems.filter((i) => i.kind === "workspace") : sortedItems;

  return (
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
          if (hasProjects && e.key === "ArrowLeft") {
            e.preventDefault();
            cycleMode(-1);
          }
          if (hasProjects && e.key === "ArrowRight") {
            e.preventDefault();
            cycleMode(1);
          }
        }}
      >
        {hasProjects ? (
          <>
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
              placeholder={mode === "new-session" ? "Select workspace..." : "Search..."}
              className="h-11 w-full border-b border-zinc-800 bg-transparent px-4 text-sm text-zinc-200 placeholder-zinc-500 outline-none"
              autoFocus
            />
            <Command.List className="max-h-80 overflow-y-auto p-1.5">
              <Command.Empty className="px-4 py-6 text-center text-sm text-zinc-500">
                No results found.
              </Command.Empty>

              {visibleItems.map((item) => (
                <Command.Item
                  key={`${item.kind}:${item.id}`}
                  value={item.value}
                  onSelect={() => handleSelect(item)}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-300 cursor-default"
                >
                  {item.kind === "project" ? (
                    <FolderOpen size={14} className="shrink-0 text-zinc-600" />
                  ) : (
                    <GitBranch size={14} className="shrink-0 text-zinc-600" />
                  )}
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.List>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-10">
            <FolderPlus size={24} className="text-zinc-600" />
            <p className="text-sm text-zinc-400">No projects yet</p>
            {onCreateProject && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateProject();
                }}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Create Project
              </button>
            )}
          </div>
        )}
      </Command>
    </div>
  );
}
