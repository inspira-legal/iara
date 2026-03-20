import { useEffect, useState } from "react";
import { X, FolderOpen, Loader2 } from "lucide-react";
import type { AddRepoInput } from "@iara/contracts";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useToast } from "./Toast";

interface AddRepoDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (input: AddRepoInput) => Promise<void>;
}

type Method = "git-url" | "local-folder" | "empty";

const METHODS: { key: Method; label: string }[] = [
  { key: "git-url", label: "Git URL" },
  { key: "local-folder", label: "Local Folder" },
  { key: "empty", label: "Empty Repo" },
];

function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git\/?$/, "").replace(/\/+$/, "");
  // Handle SSH URLs like git@github.com:user/repo
  const sshMatch = cleaned.match(/[:/]([^/]+)$/);
  if (sshMatch) return sshMatch[1]!;
  const last = cleaned.split("/").pop();
  return last || "";
}

function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  // HTTPS: https://host/path or http://host/path
  if (/^https?:\/\/.+\/.+/.test(trimmed)) return true;
  // SSH: git@host:user/repo or ssh://git@host/path
  if (/^git@[\w.-]+:.+\/.+/.test(trimmed)) return true;
  if (/^ssh:\/\/.+\/.+/.test(trimmed)) return true;
  // Git protocol: git://host/path
  if (/^git:\/\/.+\/.+/.test(trimmed)) return true;
  return false;
}

function repoNameFromPath(folderPath: string): string {
  const segments = folderPath.replace(/[\\/]+$/, "").split(/[\\/]/);
  return segments.pop() || "";
}

export function AddRepoDialog({ open, onClose, onAdd }: AddRepoDialogProps) {
  const [method, setMethod] = useState<Method>("git-url");
  const [url, setUrl] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [name, setName] = useState("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  // Auto-suggest name from URL
  useEffect(() => {
    if (method === "git-url" && !nameManuallyEdited) {
      setName(repoNameFromUrl(url));
    }
  }, [url, method, nameManuallyEdited]);

  // Auto-suggest name from folder path
  useEffect(() => {
    if (method === "local-folder" && !nameManuallyEdited) {
      setName(repoNameFromPath(folderPath));
    }
  }, [folderPath, method, nameManuallyEdited]);

  if (!open) return null;

  const resetForm = () => {
    setMethod("git-url");
    setUrl("");
    setFolderPath("");
    setName("");
    setNameManuallyEdited(false);
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleMethodChange = (m: Method) => {
    setMethod(m);
    setName("");
    setNameManuallyEdited(false);
    setError("");
  };

  const handlePickFolder = async () => {
    try {
      if (isElectron && window.desktopBridge) {
        const picked = await window.desktopBridge.pickFolder();
        if (picked) {
          setFolderPath(picked);
        }
      } else {
        // Browser fallback: prompt for path
        const picked = window.prompt("Enter the absolute path to the folder:");
        if (picked) {
          setFolderPath(picked);
        }
      }
    } catch (err) {
      toast(`Failed to pick folder: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setError("");
    setSubmitting(true);

    try {
      const input: AddRepoInput = { method, name: trimmedName };
      if (method === "git-url") {
        input.url = url.trim();
      } else if (method === "local-folder") {
        input.folderPath = folderPath;
      }

      await onAdd(input);
      resetForm();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast(`Failed to add repo: ${msg}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const urlInvalid = method === "git-url" && url.trim() !== "" && !isValidGitUrl(url);

  const canSubmit = (() => {
    if (!name.trim()) return false;
    if (method === "git-url" && (!url.trim() || urlInvalid)) return false;
    if (method === "local-folder" && !folderPath) return false;
    return true;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Add Repo</h2>
          <button type="button" onClick={handleClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Method tabs */}
          <div className="flex gap-1 rounded-md bg-zinc-800 p-1">
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => handleMethodChange(m.key)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  method === m.key
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Git URL fields */}
          {method === "git-url" && (
            <div>
              <label className="mb-1 block text-sm text-zinc-400">URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
                autoFocus
                className={`w-full rounded-md border bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none ${urlInvalid ? "border-red-500" : "border-zinc-700 focus:border-blue-500"}`}
              />
              {urlInvalid && (
                <p className="mt-1 text-xs text-red-400">
                  Invalid Git URL. Use HTTPS (https://...) or SSH (git@host:user/repo)
                </p>
              )}
            </div>
          )}

          {/* Local Folder fields */}
          {method === "local-folder" && (
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Folder</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePickFolder()}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  <FolderOpen size={14} />
                  Select Folder
                </button>
                {folderPath && (
                  <code className="min-w-0 flex-1 truncate rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-400">
                    {folderPath}
                  </code>
                )}
              </div>
            </div>
          )}

          {/* Name field (all methods) */}
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameManuallyEdited(true);
              }}
              placeholder="my-repo"
              autoFocus={method === "empty"}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
            />
          </div>

          {/* Error message */}
          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Submit */}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
