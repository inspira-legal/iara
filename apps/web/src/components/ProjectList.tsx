import { FolderOpen, Trash2 } from "lucide-react";
import type { Project } from "@iara/contracts";
import { cn } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";

interface ProjectListProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectList({ projects, selectedId, onSelect, onDelete }: ProjectListProps) {
  const handleDelete = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    try {
      const api = ensureNativeApi();
      const confirmed = await api.confirmDialog(
        `Delete project "${project.name}"?\n\nThis removes all cloned repos and worktrees. This cannot be undone.`,
      );
      if (confirmed) onDelete(project.id);
    } catch {
      // Not in Electron — delete directly
      onDelete(project.id);
    }
  };

  return (
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
            onClick={(e) => void handleDelete(e, project)}
            className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-zinc-600 hover:text-red-400 group-hover:block"
          >
            <Trash2 size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}
