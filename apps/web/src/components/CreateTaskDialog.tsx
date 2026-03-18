import { useState } from "react";
import { X } from "lucide-react";
import { useTaskStore } from "~/stores/tasks";
import { useToast } from "./Toast";

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function CreateTaskDialog({ open, onClose, projectId }: CreateTaskDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { createTask } = useTaskStore();
  const { toast } = useToast();

  if (!open) return null;

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === toSlug(name)) {
      setSlug(toSlug(value));
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !slug.trim()) return;
    setSubmitting(true);
    try {
      const input = description.trim()
        ? { name: name.trim(), slug: slug.trim(), description: description.trim() }
        : { name: name.trim(), slug: slug.trim() };
      await createTask(projectId, input);
      toast("Task created", "success");
      setName("");
      setSlug("");
      setDescription("");
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
          <h2 className="text-lg font-semibold text-zinc-100">New Task</h2>
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
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Add authentication"
              autoFocus
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="add-auth"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-zinc-600">Branch: feat/{slug || "..."}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be done?"
              rows={3}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || !slug.trim() || submitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Task"}
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
