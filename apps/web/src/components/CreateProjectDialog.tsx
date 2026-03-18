import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useProjectStore } from "~/stores/projects";
import { useToast } from "./Toast";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [repoUrls, setRepoUrls] = useState<string[]>([]);
  const [repoInput, setRepoInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { projects, createProject } = useProjectStore();
  const { toast } = useToast();

  if (!open) return null;

  const slug = toSlug(name);
  const slugTaken = slug !== "" && projects.some((p) => p.slug === slug);

  const handleAddRepo = () => {
    const url = repoInput.trim();
    if (!url || repoUrls.includes(url)) return;
    setRepoUrls((prev) => [...prev, url]);
    setRepoInput("");
  };

  const handleRepoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddRepo();
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !slug || slugTaken) return;
    setSubmitting(true);
    try {
      await createProject({ name: name.trim(), slug, repoSources: repoUrls });
      toast("Project created", "success");
      setName("");
      setRepoUrls([]);
      setRepoInput("");
      onClose();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">New Project</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My SaaS"
              autoFocus
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
            />
            {slug && (
              <p className="mt-1 text-xs text-zinc-600">
                Slug: <code className={slugTaken ? "text-red-400" : "text-zinc-500"}>{slug}</code>
                {slugTaken && <span className="ml-1 text-red-400">already exists</span>}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Repos</label>
            <div className="space-y-1">
              {repoUrls.map((url) => (
                <div key={url} className="flex items-center gap-1">
                  <code className="flex-1 truncate rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-400">
                    {url}
                  </code>
                  <button
                    type="button"
                    onClick={() => setRepoUrls((prev) => prev.filter((x) => x !== url))}
                    className="shrink-0 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300"
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
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddRepo}
                  disabled={!repoInput.trim()}
                  className="shrink-0 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-30"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || !slug || slugTaken || submitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
