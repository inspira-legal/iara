import { Pencil, Trash2 } from "lucide-react";
import type { Workspace } from "@iara/contracts";
import { TreeNode } from "./ui/TreeNode";

interface WorkspaceNodeProps {
  workspace: Workspace;
  isSelected: boolean;
  /** Protected workspaces (e.g. "main") cannot be renamed or deleted. */
  isProtected?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newName: string) => Promise<void> | void;
}

export function WorkspaceNode({
  workspace,
  isSelected,
  isProtected = false,
  onSelect,
  onDelete,
  onRename,
}: WorkspaceNodeProps) {
  return (
    <TreeNode
      name={workspace.name}
      isSelected={isSelected}
      onSelect={onSelect}
      onRename={isProtected ? undefined : onRename}
      contextMenuItems={
        isProtected
          ? undefined
          : (startEditing) => [
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
            ]
      }
    />
  );
}
