import { useState } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import type { Project } from "@iara/contracts";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";

interface ProjectListProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}

export function ProjectList({ projects, selectedId, onSelect, onDelete }: ProjectListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  return (
    <>
      <ul className="space-y-0.5">
        {projects.map((project) => (
          <li key={project.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(project.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                selectedId === project.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
              )}
            >
              <FolderOpen size={14} className="shrink-0" />
              <span className="truncate">{project.name}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(project);
              }}
              className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-zinc-600 hover:text-red-400 group-hover:block"
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Project"
        description={`Delete project "${deleteTarget?.name}"?`}
        details={
          <div className="mt-2 text-xs text-zinc-500">
            <p>This removes all cloned repos and worktrees. This cannot be undone.</p>
          </div>
        }
        confirmText="Delete Project"
        confirmVariant="danger"
        onConfirm={() => {
          onDelete(deleteTarget!.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
