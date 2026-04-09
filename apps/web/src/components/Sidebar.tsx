import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, GitBranch, Plus, X } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { useAppStore } from "~/stores/app";
import { useActiveSessionStore, type ActiveSessionEntry } from "~/stores/activeSession";
import type { CommandPaletteMode } from "~/components/CommandPalette";
import { CreateWorkspaceDialog } from "~/components/CreateWorkspaceDialog";

type SidebarTab = "chats" | "projects";

function resolveSessionTitle(entry: {
  title: string | null;
  initialPrompt: string | null;
}): string {
  if (entry.title) return entry.title;
  if (entry.initialPrompt) {
    const firstLine = entry.initialPrompt.split("\n")[0] ?? "";
    return firstLine || "New session";
  }
  return "New session";
}

export function Sidebar({
  panelRef,
  panelCollapsed,
  onOpenPalette,
  onCreateProject,
}: {
  panelRef: React.RefObject<import("react-resizable-panels").PanelImperativeHandle | null>;
  panelCollapsed: boolean;
  onOpenPalette: (mode: CommandPaletteMode) => void;
  onCreateProject: () => void;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const entriesMap = useActiveSessionStore((s) => s.entries);
  const entries = useMemo(() => [...entriesMap.values()], [entriesMap]);
  const projects = useAppStore((s) => s.projects);
  const isMac = useAppStore((s) => s.capabilities.platform === "darwin");
  const [activeTab, setActiveTab] = useState<SidebarTab>("chats");

  // Auto-switch to chats tab when navigating to a session
  useEffect(() => {
    if (pathname.startsWith("/session/")) {
      setActiveTab("chats");
    }
  }, [pathname]);

  // Local session ordering (in-memory, resets on app restart)
  const [sessionOrder, setSessionOrder] = useState<string[]>([]);

  useEffect(() => {
    const currentIds = entries.map((e) => e.id);
    setSessionOrder((prev) => {
      const currentSet = new Set(currentIds);
      const kept = prev.filter((id) => currentSet.has(id));
      const keptSet = new Set(kept);
      const added = currentIds.filter((id) => !keptSet.has(id));
      return [...kept, ...added];
    });
  }, [entries]);

  const orderedEntries = useMemo(() => {
    const byId = new Map(entries.map((e) => [e.id, e]));
    return sessionOrder.map((id) => byId.get(id)).filter(Boolean) as ActiveSessionEntry[];
  }, [entries, sessionOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSessionOrder((prev) => {
      const oldIdx = prev.indexOf(active.id as string);
      const newIdx = prev.indexOf(over.id as string);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  if (panelCollapsed) {
    return (
      <aside className="flex h-full flex-col items-center bg-zinc-900">
        <div className="flex h-12 shrink-0 items-center justify-center border-b border-zinc-800 self-stretch">
          <button
            type="button"
            onClick={() => panelRef.current?.expand()}
            className="cursor-pointer text-sm font-bold tracking-wide text-zinc-100 hover:text-zinc-300"
          >
            :)
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex h-9 shrink-0 items-center justify-center border-t border-zinc-800 self-stretch">
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 text-xs text-zinc-500">
            F1
          </kbd>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col bg-zinc-900">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center border-b border-zinc-800 px-4">
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          className="cursor-pointer text-sm font-bold tracking-wide text-zinc-100 hover:text-zinc-300"
        >
          iara
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex shrink-0 border-b border-zinc-800">
        <TabButton
          label="Chats"
          active={activeTab === "chats"}
          onClick={() => setActiveTab("chats")}
        />
        <TabButton
          label="Projects"
          active={activeTab === "projects"}
          onClick={() => setActiveTab("projects")}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 pt-3">
        {activeTab === "chats" && (
          <>
            <div className="mb-2 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onOpenPalette("new-session")}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
              >
                <Plus size={14} className="shrink-0" />
                <span className="flex-1">New Chat</span>
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-500">
                  {isMac ? "⌘" : "Ctrl+"}N
                </kbd>
              </button>
            </div>
            {orderedEntries.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={orderedEntries.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <SessionsByWorkspace
                    entries={orderedEntries}
                    projects={projects}
                    pathname={pathname}
                  />
                </SortableContext>
              </DndContext>
            ) : (
              <p className="px-2 py-4 text-center text-xs text-zinc-600">No running sessions</p>
            )}
          </>
        )}

        {activeTab === "projects" && (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={onCreateProject}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <Plus size={14} className="shrink-0" />
              New Project
            </button>
            {projects.map((project) => (
              <ProjectTree key={project.id} project={project} pathname={pathname} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex h-9 shrink-0 items-center border-t border-zinc-800 px-4">
        <span className="text-xs text-zinc-600">
          Press{" "}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 text-zinc-500">F1</kbd>{" "}
          for shortcuts
        </span>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// TabButton
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 text-center text-xs font-medium transition-colors ${
        active
          ? "border-b-2 border-accent text-zinc-100"
          : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ProjectTree
// ---------------------------------------------------------------------------

function ProjectTree({
  project,
  pathname,
}: {
  project: {
    id: string;
    slug: string;
    name: string;
    workspaces: { id: string; slug: string; name: string }[];
  };
  pathname: string;
}) {
  const navigate = useNavigate();
  const isProjectPage = pathname === `/project/${project.id}`;
  const isOpen =
    isProjectPage || project.workspaces.some((ws) => pathname === `/workspace/${ws.id}`);
  const [showCreateWs, setShowCreateWs] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => void navigate({ to: `/project/${project.id}` } as any)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
          isProjectPage
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
        }`}
      >
        <FolderOpen size={13} className="shrink-0 text-zinc-600" />
        <span className="truncate">{project.name}</span>
      </button>
      {isOpen && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-zinc-800 pl-2 pt-0.5">
          {project.workspaces.map((ws) => {
            const isWsActive = pathname === `/workspace/${ws.id}`;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => void navigate({ to: `/workspace/${ws.id}` } as any)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
                  isWsActive
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                <GitBranch size={12} className="shrink-0 text-zinc-600" />
                <span className="truncate">{ws.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowCreateWs(true)}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
          >
            <Plus size={12} className="shrink-0" />
            <span>New Workspace</span>
          </button>
        </div>
      )}
      <CreateWorkspaceDialog
        open={showCreateWs}
        onClose={() => setShowCreateWs(false)}
        projectId={project.id}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionsByWorkspace
// ---------------------------------------------------------------------------

function SessionsByWorkspace({
  entries,
  projects,
  pathname,
}: {
  entries: ActiveSessionEntry[];
  projects: { id: string; name: string; workspaces: { id: string; name: string }[] }[];
  pathname: string;
}) {
  const grouped = useMemo(() => {
    const groups: {
      workspaceId: string;
      projectId: string;
      projectName: string;
      workspaceName: string;
      entries: ActiveSessionEntry[];
    }[] = [];
    const map = new Map<string, (typeof groups)[0]>();

    for (const entry of entries) {
      let group = map.get(entry.workspaceId);
      if (!group) {
        const projectId = entry.workspaceId.split("/")[0]!;
        const project = projects.find((p) => p.id === projectId);
        const workspace = project?.workspaces.find((w) => w.id === entry.workspaceId);
        group = {
          workspaceId: entry.workspaceId,
          projectId,
          projectName: project?.name ?? "Unknown",
          workspaceName: workspace?.name ?? entry.workspaceId.split("/")[1] ?? "unknown",
          entries: [],
        };
        map.set(entry.workspaceId, group);
        groups.push(group);
      }
      group.entries.push(entry);
    }
    return groups;
  }, [entries, projects]);

  return (
    <div className="flex flex-col gap-2">
      {grouped.map((group) => (
        <div key={group.workspaceId}>
          <div className="mb-0.5 truncate px-2 text-xs font-medium text-zinc-500">
            {group.projectName} / {group.workspaceName}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.entries.map((entry) => (
              <SortableSessionItem
                key={entry.id}
                entry={entry}
                isActive={pathname === `/session/${entry.id}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableSessionItem
// ---------------------------------------------------------------------------

function SortableSessionItem({
  entry,
  isActive,
}: {
  entry: ActiveSessionEntry;
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(resolveSessionTitle(entry));
    setEditing(true);
  };

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== resolveSessionTitle(entry)) {
      void useActiveSessionStore.getState().renameSession(entry.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!editing) void navigate({ to: "/session/$id", params: { id: entry.id } } as any);
      }}
      onKeyDown={(e) => {
        if (!editing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          void navigate({ to: "/session/$id", params: { id: entry.id } } as any);
        }
      }}
      className={`group flex w-full items-start gap-2 rounded px-2 py-1.5 text-left cursor-default focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:outline-none ${
        isActive
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
      }`}
    >
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded bg-zinc-800 px-1 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-accent-ring"
            autoFocus
          />
        ) : (
          <div className="truncate text-sm" onDoubleClick={startEditing}>
            {resolveSessionTitle(entry)}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void useActiveSessionStore.getState().destroy(entry.id);
          if (isActive) {
            void navigate({ to: "/" });
          }
        }}
        className="shrink-0 rounded p-1 text-zinc-600 opacity-0 hover:bg-zinc-700 hover:text-zinc-400 group-hover:opacity-100"
        aria-label="Close session"
      >
        <X size={14} />
      </button>
    </div>
  );
}
