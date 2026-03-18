import { FolderOpen } from "lucide-react";
import type { Project } from "@iara/contracts";
import { cn } from "~/lib/utils";

interface ProjectListProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ProjectList({ projects, selectedId, onSelect }: ProjectListProps) {
  return (
    <ul className="space-y-0.5">
      {projects.map((project) => (
        <li key={project.id}>
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
        </li>
      ))}
    </ul>
  );
}
