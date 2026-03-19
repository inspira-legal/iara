import { useState, useCallback, useEffect } from "react";
import { ChevronRight, FolderOpen, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import type { Project, Task } from "@iara/contracts";
import { TaskNode } from "./TaskNode";
import { SidebarContextMenu, type ContextMenuItem } from "./SidebarContextMenu";
import { useTaskStore } from "~/stores/tasks";
import { ConfirmDialog } from "./ConfirmDialog";

const MAX_VISIBLE_TASKS = 6;

interface ProjectNodeProps {
  project: Project;
  isExpanded: boolean;
  onToggle: () => void;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onCreateTask: () => void;
  onDeleteProject: () => void;
  onRenameProject: (newName: string) => Promise<void> | void;
}

export function ProjectNode({
  project,
  isExpanded,
  onToggle,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  onDeleteProject,
  onRenameProject,
}: ProjectNodeProps) {
  const { loadTasks, getTasksForProject, completeTask, deleteTask, loading, error } =
    useTaskStore();

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
          className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-zinc-800/50"
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

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateTask();
            }}
            className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 group-hover:opacity-100"
            title={`New Task (in ${project.name})`}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Expanded: tasks */}
        {isExpanded && (
          <div className="ml-3 flex flex-col gap-0.5 border-l border-zinc-800 pl-2">
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
            ) : tasks.length === 0 ? (
              <button
                type="button"
                onClick={onCreateTask}
                className="px-2 py-2 text-left text-xs text-zinc-600 hover:text-zinc-400"
              >
                No tasks — click to create
              </button>
            ) : (
              <>
                {visibleTasks.map((task) => (
                  <TaskNode
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onSelect={() => onSelectTask(task.id)}
                    onComplete={() => void completeTask(task.id)}
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
