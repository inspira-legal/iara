import { useState } from "react";
import {
  ChevronRight,
  FolderOpen,
  FolderGit2,
  FolderPlus,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Project, Workspace } from "@iara/contracts";
import { TaskNode } from "./TaskNode";
import { SidebarContextMenu, type ContextMenuItem } from "./SidebarContextMenu";
import { useAppStore } from "~/stores/app";
import { ConfirmDialog } from "./ConfirmDialog";
import { useInlineEdit } from "~/hooks/useInlineEdit";
import { useContextMenu } from "~/hooks/useContextMenu";

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
  const { getWorkspacesForProject, deleteWorkspace } = useAppStore();
  const loading = false;
  const error = null;

  const tasks = getWorkspacesForProject(project.id).filter((w) => !w.id.endsWith("/default"));
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const { editing, startEditing, inputProps } = useInlineEdit(project.name, onRenameProject);
  const { position: contextMenu, handleContextMenu, close: closeContextMenu } = useContextMenu();

  const visibleTasks = showAll ? tasks : tasks.slice(0, MAX_VISIBLE_TASKS);
  const hiddenCount = tasks.length - MAX_VISIBLE_TASKS;

  const contextMenuItems: ContextMenuItem[] = [
    { label: "New Task", icon: Plus, onClick: onCreateTask },
    ...(onAddRepo ? [{ label: "Add Repo", icon: FolderPlus, onClick: onAddRepo }] : []),
    {
      label: "Rename",
      icon: Pencil,
      onClick: startEditing,
    },
    { label: "Delete", icon: Trash2, onClick: onDeleteProject, variant: "danger" },
  ];

  return (
    <>
      <div className="flex flex-col">
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

          {editing ? (
            <input type="text" {...inputProps} />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              onDoubleClick={startEditing}
              title={project.name}
              className="min-w-0 flex-1 truncate text-left text-sm text-zinc-300 hover:text-zinc-100"
            >
              {project.name}
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="ml-3 flex flex-col gap-0.5 border-l border-zinc-800 pl-2">
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
          onClose={closeContextMenu}
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
            void deleteWorkspace(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
