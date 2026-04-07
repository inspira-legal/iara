import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, MessageSquare, Plus, X } from "lucide-react";
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
import { CommandPalette, type CommandPaletteMode } from "~/components/CommandPalette";
import { CreateProjectDialog } from "~/components/CreateProjectDialog";

type SidebarTab = "sessions" | "projects";

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
}: {
  panelRef: React.RefObject<import("react-resizable-panels").PanelImperativeHandle | null>;
  panelCollapsed: boolean;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const entriesMap = useActiveSessionStore((s) => s.entries);
  const entries = useMemo(() => [...entriesMap.values()], [entriesMap]);
  const projects = useAppStore((s) => s.projects);
  const [paletteMode, setPaletteMode] = useState<CommandPaletteMode | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab | null>("sessions");
  const [showCreateProject, setShowCreateProject] = useState(false);

  // Sync activeTab with panel collapsed state (from drag resize)
  const [prevCollapsed, setPrevCollapsed] = useState(panelCollapsed);
  if (panelCollapsed !== prevCollapsed) {
    setPrevCollapsed(panelCollapsed);
    if (panelCollapsed && activeTab !== null) setActiveTab(null);
    if (!panelCollapsed && activeTab === null) setActiveTab("sessions");
  }

  const toggleTab = (tab: SidebarTab) => {
    setActiveTab((prev) => {
      const next = prev === tab ? null : tab;
      if (next !== null) {
        panelRef.current?.expand();
      } else {
        panelRef.current?.collapse();
      }
      return next;
    });
  };

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

  const isCollapsed = activeTab === null;

  return (
    <aside className="flex h-full flex-col bg-zinc-900">
      {/* Top bar */}
      <div
        className={`flex h-12 shrink-0 items-center border-b border-zinc-800 px-4 ${isCollapsed ? "justify-center" : ""}`}
      >
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          className="cursor-pointer text-sm font-bold tracking-wide text-zinc-100 hover:text-zinc-300"
        >
          {isCollapsed ? ":)" : "iara"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 py-3">
          <ActivityBarButton
            icon={MessageSquare}
            label="Sessions"
            active={activeTab === "sessions"}
            onClick={() => toggleTab("sessions")}
            badge={entries.length > 0 ? entries.length : undefined}
          />
          <ActivityBarButton
            icon={FolderOpen}
            label="Projects"
            active={activeTab === "projects"}
            onClick={() => toggleTab("projects")}
          />
          <div className="flex-1" />
        </div>

        {/* Panel content */}
        {activeTab && (
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-2 pt-3">
              {activeTab === "sessions" && (
                <div className="mb-2 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setPaletteMode("new-session")}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    <Plus size={14} className="shrink-0" />
                    New Session
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaletteMode("workspaces")}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    <FolderOpen size={14} className="shrink-0" />
                    Go to Workspace
                  </button>
                </div>
              )}
              {activeTab === "sessions" && (
                <>
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
                    <p className="px-2 py-4 text-center text-xs text-zinc-600">
                      No running sessions
                    </p>
                  )}
                </>
              )}

              {activeTab === "projects" && (
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowCreateProject(true)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    <Plus size={14} className="shrink-0" />
                    New Project
                  </button>
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => void navigate({ to: `/project/${project.id}` } as any)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                        pathname === `/project/${project.id}`
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                      }`}
                    >
                      <FolderOpen size={13} className="shrink-0 text-zinc-600" />
                      <span className="truncate">{project.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className={`flex h-9 shrink-0 items-center border-t border-zinc-800 px-4 ${isCollapsed ? "justify-center" : ""}`}
      >
        {isCollapsed ? (
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 text-xs text-zinc-500">
            F1
          </kbd>
        ) : (
          <span className="text-xs text-zinc-600">
            Press{" "}
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 text-zinc-500">F1</kbd>{" "}
            for shortcuts
          </span>
        )}
      </div>

      <CommandPalette
        open={paletteMode !== null}
        onClose={() => setPaletteMode(null)}
        mode={paletteMode ?? "workspaces"}
      />
      <CreateProjectDialog open={showCreateProject} onClose={() => setShowCreateProject(false)} />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// ActivityBarButton
// ---------------------------------------------------------------------------

function ActivityBarButton({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active?: boolean | undefined;
  badge?: number | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative flex h-8 w-8 items-center justify-center rounded ${
        active
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
      }`}
    >
      <Icon size={16} />
      {badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
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
          <div className="mb-0.5 px-2">
            <span className="truncate text-xs font-medium text-zinc-500">
              {group.projectName} / {group.workspaceName}
            </span>
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
        className="mt-0.5 shrink-0 rounded p-0.5 text-zinc-600 opacity-0 hover:bg-zinc-700 hover:text-zinc-400 group-hover:opacity-100"
        aria-label="Close session"
      >
        <X size={12} />
      </button>
    </div>
  );
}
