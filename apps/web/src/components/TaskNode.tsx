import { useState, useCallback } from "react";
import { GitBranch, Circle, Pencil, Copy, Trash2 } from "lucide-react";
import type { Task } from "@iara/contracts";
import { SidebarContextMenu, type ContextMenuItem } from "./SidebarContextMenu";
import { formatRelativeTime, formatAbsoluteTime } from "~/lib/format-relative-time";

interface TaskNodeProps {
  task: Task;
  isSelected: boolean;
  onSelect: () => void;

  onDelete: () => void;
  onRename: (newName: string) => Promise<void> | void;
}

export function TaskNode({
  task,
  isSelected,
  onSelect,

  onDelete,
  onRename,
}: TaskNodeProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.name);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDoubleClick = useCallback(() => {
    setDraft(task.name);
    setEditing(true);
  }, [task.name]);

  const handleSaveRename = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.name) {
      await onRename(trimmed);
    }
    setEditing(false);
  }, [draft, task.name, onRename]);

  const handleCopyBranch = useCallback(() => {
    void navigator.clipboard.writeText(task.branch);
  }, [task.branch]);

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: "Rename",
      icon: Pencil,
      onClick: () => {
        setDraft(task.name);
        setEditing(true);
      },
    },

    {
      label: "Copy Branch",
      icon: Copy,
      onClick: handleCopyBranch,
    },
    {
      label: "Delete",
      icon: Trash2,
      onClick: onDelete,
      variant: "danger" as const,
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        title={task.name}
        className={`group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
          isSelected
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
        }`}
      >
        {/* Status icon */}
        <div className="mt-0.5 shrink-0" title="Active">
          <Circle size={14} className="fill-current text-blue-400" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
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
              className="w-full rounded border border-zinc-600 bg-zinc-800 px-1 py-0 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          ) : (
            <span className="block truncate text-sm">{task.name}</span>
          )}
          <div className="flex items-center gap-1">
            <GitBranch size={10} className="shrink-0 text-zinc-600" />
            <span className="truncate text-xs text-zinc-600">{task.branch}</span>
          </div>
        </div>

        {/* Timestamp */}
        <span
          className="shrink-0 pt-0.5 text-xs text-zinc-600"
          title={formatAbsoluteTime(task.updatedAt)}
        >
          {formatRelativeTime(task.updatedAt)}
        </span>
      </button>

      {contextMenu && (
        <SidebarContextMenu
          items={contextMenuItems}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
