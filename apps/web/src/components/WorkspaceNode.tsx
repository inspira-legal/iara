import { Pencil, Trash2, Circle } from "lucide-react";
import type { Workspace } from "@iara/contracts";
import { isScriptActive, isScriptUnhealthy } from "~/lib/script-status";
import { useScriptsStore } from "~/stores/scripts";
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
  const runningInWorkspace = useScriptsStore(
    (s) =>
      s.config?.statuses.filter((st) => st.workspace === workspace.slug && isScriptActive(st))
        .length ?? 0,
  );
  const hasUnhealthy = useScriptsStore(
    (s) =>
      s.config?.statuses.some((st) => st.workspace === workspace.slug && isScriptUnhealthy(st)) ??
      false,
  );

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
      icon={
        runningInWorkspace > 0 ? (
          <Circle
            size={6}
            className={`shrink-0 fill-current ${hasUnhealthy ? "text-red-500" : "text-green-500"}`}
          />
        ) : undefined
      }
    />
  );
}
