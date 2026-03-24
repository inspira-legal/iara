import type { ReactNode } from "react";
import { SidebarContextMenu, type ContextMenuItem } from "../SidebarContextMenu";
import { useInlineEdit } from "~/hooks/useInlineEdit";
import { useContextMenu } from "~/hooks/useContextMenu";

const _noop = () => {};

interface TreeNodeProps {
  name: string;
  isSelected: boolean;
  onSelect: () => void;
  onRename?: ((newName: string) => Promise<void> | void) | undefined;
  contextMenuItems?:
    | ContextMenuItem[]
    | ((startEditing: () => void) => ContextMenuItem[])
    | undefined;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function TreeNode({
  name,
  isSelected,
  onSelect,
  onRename,
  contextMenuItems,
  icon,
  children,
  className,
}: TreeNodeProps) {
  const { editing, startEditing, inputProps } = useInlineEdit(name, onRename ?? _noop);
  const { position: contextMenu, handleContextMenu, close: closeContextMenu } = useContextMenu();

  const resolvedItems = contextMenuItems
    ? typeof contextMenuItems === "function"
      ? contextMenuItems(startEditing)
      : contextMenuItems
    : [];

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-selected={isSelected}
        onClick={onSelect}
        onContextMenu={contextMenuItems ? handleContextMenu : undefined}
        onDoubleClick={onRename ? startEditing : undefined}
        title={name}
        className={`group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
          isSelected
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
        } ${className ?? ""}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {icon}
            {editing ? (
              <input
                type="text"
                {...inputProps}
                className="w-full rounded border border-zinc-600 bg-zinc-800 px-1 py-0 text-sm text-zinc-100 outline-none focus:border-blue-500"
              />
            ) : (
              <span className="block truncate text-sm">{name}</span>
            )}
          </div>
        </div>
      </button>

      {children}

      {contextMenu && resolvedItems.length > 0 && (
        <SidebarContextMenu
          items={resolvedItems}
          position={contextMenu}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
}
