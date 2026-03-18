import { useState } from "react";
import { X, FolderPlus } from "lucide-react";
import { useProjectStore } from "~/stores/projects";
import { ensureNativeApi } from "~/nativeApi";
import { useToast } from "./Toast";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { createProject } = useProjectStore();
  const { toast } = useToast();

  if (!open) return null;

  const { projects } = useProjectStore();
  const slug = toSlug(name);
  const slugTaken = slug !== "" && projects.some((p) => p.slug === slug);

  const handleAddRepo = async () => {
    try {
      const api = ensureNativeApi();
      const folder = await api.pickFolder();
      if (folder) setRepoPaths((prev) => [...prev, folder]);
    } catch {
      // Not in Electron
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !slug || slugTaken) return;
    setSubmitting(true);
    try {
      await createProject({ name: name.trim(), slug, repoSources: repoPaths });
      toast("Project created", "success");
      setName("");
      setRepoPaths([]);
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
            {repoPaths.map((p) => (
              <div key={p} className="mb-1 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
                  {p}
                </code>
                <button
                  type="button"
                  onClick={() => setRepoPaths((prev) => prev.filter((x) => x !== p))}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void handleAddRepo()}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <FolderPlus size={14} />
              Add repo folder
            </button>
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
