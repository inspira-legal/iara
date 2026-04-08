import { useState } from "react";
import { useAppStore } from "~/stores/app";
import { toSlug } from "~/lib/utils";
import { useToast } from "./Toast";
import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function CreateWorkspaceDialog({ open, onClose, projectId }: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const { toast } = useToast();
  const createWorkspace = useAppStore((s) => s.createWorkspace);

  const computedSlug = toSlug(name);

  const resetForm = () => {
    setName("");
  };

  if (!open) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim() || !computedSlug) return;

    try {
      await createWorkspace(projectId, { name: name.trim(), slug: computedSlug });
      toast("Workspace created", "success");
      resetForm();
      onClose();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  return (
    <DialogShell open={open} title="New Workspace" maxWidth="max-w-lg" onClose={handleClose}>
      <div className="space-y-4">
        <div>
          <Label>Workspace Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && computedSlug) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Add authentication"
            autoFocus
          />
          {computedSlug && (
            <p className="mt-1 text-xs text-zinc-500">branch: feat/{computedSlug}</p>
          )}
        </div>

        <Button
          variant="primary"
          fullWidth
          onClick={() => void handleSubmit()}
          disabled={!name.trim() || !computedSlug}
        >
          Create Workspace
        </Button>
      </div>
    </DialogShell>
  );
}
