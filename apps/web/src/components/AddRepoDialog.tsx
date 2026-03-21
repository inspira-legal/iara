import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import type { AddRepoInput } from "@iara/contracts";
import { isElectron } from "~/env";
import { useToast } from "./Toast";
import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { TabGroup } from "./ui/TabGroup";
import { Spinner } from "./ui/Spinner";

interface AddRepoDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (input: AddRepoInput) => Promise<void>;
}

type Method = "git-url" | "local-folder" | "empty";

const METHOD_OPTIONS: { key: Method; label: string }[] = [
  { key: "git-url", label: "Git URL" },
  { key: "local-folder", label: "Local Folder" },
  { key: "empty", label: "Empty Repo" },
];

function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git\/?$/, "").replace(/\/+$/, "");
  const sshMatch = cleaned.match(/[:/]([^/]+)$/);
  if (sshMatch) return sshMatch[1]!;
  const last = cleaned.split("/").pop();
  return last || "";
}

function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^https?:\/\/.+\/.+/.test(trimmed)) return true;
  if (/^git@[\w.-]+:.+\/.+/.test(trimmed)) return true;
  if (/^ssh:\/\/.+\/.+/.test(trimmed)) return true;
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

  useEffect(() => {
    if (method === "git-url" && !nameManuallyEdited) {
      setName(repoNameFromUrl(url));
    }
  }, [url, method, nameManuallyEdited]);

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
    <DialogShell open={open} title="Add Repo" onClose={handleClose}>
      <div className="space-y-4">
        <TabGroup value={method} onChange={handleMethodChange} options={METHOD_OPTIONS} />

        {method === "git-url" && (
          <div>
            <Label>URL</Label>
            <Input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
              autoFocus
              error={urlInvalid}
            />
            {urlInvalid && (
              <p className="mt-1 text-xs text-red-400">
                Invalid Git URL. Use HTTPS (https://...) or SSH (git@host:user/repo)
              </p>
            )}
          </div>
        )}

        {method === "local-folder" && (
          <div>
            <Label>Folder</Label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => void handlePickFolder()}>
                <FolderOpen size={14} />
                Select Folder
              </Button>
              {folderPath && (
                <code className="min-w-0 flex-1 truncate rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-400">
                  {folderPath}
                </code>
              )}
            </div>
          </div>
        )}

        <div>
          <Label>Name</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameManuallyEdited(true);
            }}
            placeholder="my-repo"
            autoFocus={method === "empty"}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button
          variant="primary"
          fullWidth
          onClick={() => void handleSubmit()}
          disabled={!canSubmit || submitting}
        >
          {submitting ? <Spinner /> : null}
          {submitting ? "Adding..." : "Add"}
        </Button>
      </div>
    </DialogShell>
  );
}
