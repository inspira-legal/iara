import { useState } from "react";
import { Plus, X, FolderOpen } from "lucide-react";
import type { Project } from "@iara/contracts";
import { useProjectStore } from "~/stores/projects";
import { useToast } from "./Toast";
import { ensureNativeApi } from "~/nativeApi";

interface ProjectViewProps {
  project: Project;
}

export function ProjectView({ project }: ProjectViewProps) {
  const [repoInput, setRepoInput] = useState("");
  const [adding, setAdding] = useState(false);
  const { updateProject } = useProjectStore();
  const { toast } = useToast();

  const handleAddRepo = async () => {
    const url = repoInput.trim();
    if (!url) return;
    if (project.repoSources.includes(url)) {
      toast("Repo already added", "error");
      return;
    }

    setAdding(true);
    try {
      await updateProject(project.id, {
        repoSources: [...project.repoSources, url],
      });
      setRepoInput("");
      toast("Repo added — cloning in background", "success");
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveRepo = async (url: string) => {
    try {
      const api = ensureNativeApi();
      const confirmed = await api.confirmDialog(
        `Remove repo "${url}" from project?\n\nThe cloned repo in .repos/ will be deleted.`,
      );
      if (!confirmed) return;

      await updateProject(project.id, {
        repoSources: project.repoSources.filter((r) => r !== url),
      });
      toast("Repo removed", "info");
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const handleRepoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleAddRepo();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-zinc-500">
          <FolderOpen size={16} />
          <span className="text-xs">Project</span>
        </div>
        <h2 className="mt-1 text-xl font-semibold text-zinc-100">{project.name}</h2>
        <p className="mt-1 text-xs text-zinc-600">Slug: {project.slug}</p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Repos</h3>

        <div className="space-y-1.5">
          {project.repoSources.map((url) => (
            <div key={url} className="flex items-center gap-1">
              <code className="flex-1 truncate rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100">
                {url}
              </code>
              <button
                type="button"
                onClick={() => void handleRemoveRepo(url)}
                className="shrink-0 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-700 hover:text-red-400"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-1">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={handleRepoKeyDown}
              placeholder="https://github.com/user/repo.git"
              disabled={adding}
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleAddRepo()}
              disabled={!repoInput.trim() || adding}
              className="shrink-0 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-30"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {project.repoSources.length === 0 && (
          <p className="mt-3 text-xs text-zinc-600">
            No repos yet. Add a git URL above to get started.
          </p>
        )}
      </div>

      <div className="mt-8 text-xs text-zinc-600">
        <p>Select or create a task to start working.</p>
      </div>
    </div>
  );
}
