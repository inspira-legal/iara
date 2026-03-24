import { useState } from "react";
import { ChevronRight, FolderOpen, FolderPlus, Plus, Pencil, Trash2 } from "lucide-react";
import type { Project, Workspace } from "@iara/contracts";
import { WorkspaceNode } from "./WorkspaceNode";
import { SidebarContextMenu, type ContextMenuItem } from "./SidebarContextMenu";
import { useAppStore } from "~/stores/app";
import { ConfirmDialog } from "./ConfirmDialog";
import { useInlineEdit } from "~/hooks/useInlineEdit";
import { useContextMenu } from "~/hooks/useContextMenu";

const MAX_VISIBLE_WORKSPACES = 6;

interface ProjectNodeProps {
  project: Project;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string | null) => void;
  onCreateWorkspace: () => void;
  onDeleteProject: () => void;
  onRenameProject: (newName: string) => Promise<void> | void;
  onAddRepo?: (() => void) | undefined;
}

export function ProjectNode({
  project,
  isExpanded,
  isSelected,
  onToggle,
  selectedWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onDeleteProject,
  onRenameProject,
  onAddRepo,
}: ProjectNodeProps) {
  const { getWorkspacesForProject, updateWorkspace, deleteWorkspace } = useAppStore();

  const workspaces = getWorkspacesForProject(project.id);
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const { editing, startEditing, inputProps } = useInlineEdit(project.name, onRenameProject);
  const { position: contextMenu, handleContextMenu, close: closeContextMenu } = useContextMenu();

  const visibleWorkspaces = showAll ? workspaces : workspaces.slice(0, MAX_VISIBLE_WORKSPACES);
  const hiddenCount = workspaces.length - MAX_VISIBLE_WORKSPACES;

  const contextMenuItems: ContextMenuItem[] = [
    { label: "New Workspace", icon: Plus, onClick: onCreateWorkspace },
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
      <div
        role="treeitem"
        aria-expanded={isExpanded}
        aria-label={project.name}
        className="flex flex-col"
      >
        <div
          className={`group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors ${isSelected ? "bg-zinc-800" : "hover:bg-zinc-800/50"}`}
          onContextMenu={handleContextMenu}
        >
          <button
            type="button"
            onClick={onToggle}
            aria-label={isExpanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
            className="shrink-0 rounded text-zinc-500 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            />
          </button>

          <FolderOpen size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />

          {editing ? (
            <input type="text" {...inputProps} />
          ) : (
            <button
              type="button"
              onClick={() => {
                onSelectWorkspace(null);
                if (!isExpanded) onToggle();
              }}
              onDoubleClick={startEditing}
              title={project.name}
              className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-zinc-200 hover:text-zinc-50"
            >
              {project.name}
            </button>
          )}
        </div>

        {isExpanded && (
          <div role="group" className="ml-3 flex flex-col gap-0.5 border-l border-zinc-800/60 pl-2">
            {visibleWorkspaces.map((ws) => (
              <WorkspaceNode
                key={ws.id}
                workspace={ws}
                isSelected={selectedWorkspaceId === ws.id}
                isProtected={ws.slug === "main"}
                onSelect={() => onSelectWorkspace(ws.id)}
                onDelete={() => setDeleteTarget(ws)}
                onRename={async (newName) => {
                  await updateWorkspace(ws.id, { name: newName });
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

            <button
              type="button"
              onClick={onCreateWorkspace}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-zinc-600 transition-colors hover:bg-zinc-800/50 hover:text-zinc-400"
            >
              <Plus size={12} className="shrink-0" />
              <span>New workspace</span>
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
        title="Delete Workspace"
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
