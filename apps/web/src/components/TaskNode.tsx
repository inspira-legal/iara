import { Pencil, Trash2, Circle } from "lucide-react";
import type { Workspace } from "@iara/contracts";
import { SidebarContextMenu, type ContextMenuItem } from "./SidebarContextMenu";
import { isScriptActive, isScriptUnhealthy } from "~/lib/script-status";
import { useScriptsStore } from "~/stores/scripts";
import { formatRelativeTime, formatAbsoluteTime } from "~/lib/format-relative-time";
import { useInlineEdit } from "~/hooks/useInlineEdit";
import { useContextMenu } from "~/hooks/useContextMenu";

interface TaskNodeProps {
  task: Workspace;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newName: string) => Promise<void> | void;
}

export function TaskNode({ task, isSelected, onSelect, onDelete, onRename }: TaskNodeProps) {
  const runningInTask = useScriptsStore(
    (s) =>
      s.config?.statuses.filter((st) => st.workspace === task.slug && isScriptActive(st)).length ??
      0,
  );
  const hasUnhealthy = useScriptsStore(
    (s) =>
      s.config?.statuses.some((st) => st.workspace === task.slug && isScriptUnhealthy(st)) ?? false,
  );

  const { editing, startEditing, inputProps } = useInlineEdit(task.name, onRename);
  const { position: contextMenu, handleContextMenu, close: closeContextMenu } = useContextMenu();

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: "Rename",
      icon: Pencil,
      onClick: startEditing,
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
        onDoubleClick={startEditing}
        title={task.name}
        className={`group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
          isSelected
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {runningInTask > 0 && (
              <Circle
                size={6}
                className={`shrink-0 fill-current ${hasUnhealthy ? "text-red-500" : "text-green-500"}`}
              />
            )}
            {editing ? (
              <input
                type="text"
                {...inputProps}
                className="w-full rounded border border-zinc-600 bg-zinc-800 px-1 py-0 text-sm text-zinc-100 outline-none focus:border-blue-500"
              />
            ) : (
              <span className="block truncate text-sm">{task.name}</span>
            )}
          </div>
        </div>

        <span
          className="shrink-0 pt-0.5 text-xs text-zinc-600"
          title={formatAbsoluteTime(task.createdAt)}
        >
          {formatRelativeTime(task.createdAt)}
        </span>
      </button>

      {contextMenu && (
        <SidebarContextMenu
          items={contextMenuItems}
          position={contextMenu}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
}
