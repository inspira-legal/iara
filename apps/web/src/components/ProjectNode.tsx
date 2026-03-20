import { useState, useCallback, useEffect } from "react";
import {
  ChevronRight,
  FolderOpen,
  FolderGit2,
  FolderPlus,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Circle,
} from "lucide-react";
import type { Project, Task } from "@iara/contracts";
import { TaskNode } from "./TaskNode";
import { SidebarContextMenu, type ContextMenuItem } from "./SidebarContextMenu";
import { isScriptActive, isScriptUnhealthy } from "~/lib/script-status";
import { useTaskStore } from "~/stores/tasks";
import { useScriptsStore } from "~/stores/scripts";
import { ConfirmDialog } from "./ConfirmDialog";

const MAX_VISIBLE_TASKS = 6;

interface ProjectNodeProps {
  project: Project;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onCreateTask: () => void;
  onDeleteProject: () => void;
  onRenameProject: (newName: string) => Promise<void> | void;
  onAddRepo?: (() => void) | undefined;
}

export function ProjectNode({
  project,
  isExpanded,
  isSelected,
  onToggle,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  onDeleteProject,
  onRenameProject,
  onAddRepo,
}: ProjectNodeProps) {
  const { loadTasks, getTasksForProject, deleteTask, loading, error } = useTaskStore();
  const hasRunning = useScriptsStore((s) => s.config?.statuses.some(isScriptActive) ?? false);
  const hasUnhealthy = useScriptsStore((s) => s.config?.statuses.some(isScriptUnhealthy) ?? false);

  const tasks = getTasksForProject(project.id);
  const [showAll, setShowAll] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  // Load tasks when expanded
  useEffect(() => {
    if (isExpanded) {
      void loadTasks(project.id);
    }
  }, [isExpanded, project.id, loadTasks]);

  const visibleTasks = showAll ? tasks : tasks.slice(0, MAX_VISIBLE_TASKS);
  const hiddenCount = tasks.length - MAX_VISIBLE_TASKS;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDoubleClick = useCallback(() => {
    setDraft(project.name);
    setEditing(true);
  }, [project.name]);

  const handleSaveRename = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== project.name) {
      await onRenameProject(trimmed);
    }
    setEditing(false);
  }, [draft, project.name, onRenameProject]);

  const contextMenuItems: ContextMenuItem[] = [
    { label: "New Task", icon: Plus, onClick: onCreateTask },
    ...(onAddRepo ? [{ label: "Add Repo", icon: FolderPlus, onClick: onAddRepo }] : []),
    {
      label: "Rename",
      icon: Pencil,
      onClick: () => {
        setDraft(project.name);
        setEditing(true);
      },
    },
    { label: "Delete", icon: Trash2, onClick: onDeleteProject, variant: "danger" },
  ];

  return (
    <>
      <div className="flex flex-col">
        {/* Project header */}
        <div
          className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-zinc-800/50"
          onContextMenu={handleContextMenu}
        >
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 text-zinc-500 hover:text-zinc-300"
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            />
          </button>

          <FolderOpen size={14} className="shrink-0 text-zinc-500" />

          {hasRunning && (
            <Circle
              size={6}
              className={`shrink-0 fill-current ${hasUnhealthy ? "text-red-500" : "text-green-500"}`}
            />
          )}

          {editing ? (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSaveRename();
                } else if (e.key === "Escape") {
                  setEditing(false);
                }
              }}
              onBlur={() => void handleSaveRename()}
              autoFocus
              className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-1 py-0 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              onDoubleClick={handleDoubleClick}
              title={project.name}
              className="min-w-0 flex-1 truncate text-left text-sm text-zinc-300 hover:text-zinc-100"
            >
              {project.name}
            </button>
          )}
        </div>

        {/* Expanded: tasks */}
        {isExpanded && (
          <div className="ml-3 flex flex-col gap-0.5 border-l border-zinc-800 pl-2">
            {/* Project Workspace item */}
            <button
              type="button"
              onClick={() => onSelectTask(null)}
              className={`flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm transition-colors ${
                isSelected
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
              } mb-1`}
            >
              <FolderGit2 size={12} className="shrink-0" />
              <span className="truncate">Default Workspace</span>
            </button>

            {loading && tasks.length === 0 ? (
              <p className="px-2 py-2 text-xs text-zinc-600">Loading...</p>
            ) : error ? (
              <div className="flex items-center gap-1 px-2 py-2">
                <p className="text-xs text-red-400">Failed to load</p>
                <button
                  type="button"
                  onClick={() => void loadTasks(project.id)}
                  className="rounded p-0.5 text-zinc-500 hover:text-zinc-300"
                  title="Retry"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            ) : (
              <>
                {visibleTasks.map((task) => (
                  <TaskNode
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onSelect={() => onSelectTask(task.id)}
                    onDelete={() => setDeleteTarget(task)}
                    onRename={async (newName) => {
                      // TODO: wire up task rename when API supports it
                      console.log("Rename task", task.id, "to", newName);
                    }}
                  />
                ))}

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="px-2 py-1 text-left text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    {showAll ? "Show less" : `Show ${hiddenCount} more...`}
                  </button>
                )}
              </>
            )}

            {/* Fixed add task button */}
            <button
              type="button"
              onClick={onCreateTask}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-zinc-600 transition-colors hover:bg-zinc-800/50 hover:text-zinc-400"
            >
              <Plus size={12} className="shrink-0" />
              <span>New task</span>
            </button>
          </div>
        )}
      </div>

      {contextMenu && (
        <SidebarContextMenu
          items={contextMenuItems}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Task"
        description={`Delete "${deleteTarget?.name}"? This will remove its worktrees.`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            void deleteTask(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
