import { useState } from "react";
import { transport } from "~/lib/ws-transport.js";
import { useToast } from "./Toast";
import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";
import { Label } from "./ui/Label";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function CreateWorkspaceDialog({ open, onClose, projectId }: CreateWorkspaceDialogProps) {
  const [userGoal, setUserGoal] = useState("");
  const { toast } = useToast();

  const resetForm = () => {
    setUserGoal("");
  };

  if (!open) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!userGoal.trim()) return;

    try {
      await transport.request("workspaces.createFromPrompt", {
        projectId,
        prompt: userGoal.trim(),
      });
      // Dialog closes immediately — toast tracks progress
      resetForm();
      onClose();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && userGoal.trim()) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <DialogShell open={open} title="New Workspace" maxWidth="max-w-lg" onClose={handleClose}>
      <div className="space-y-4">
        <div>
          <Label>What are you working on?</Label>
          <Textarea
            value={userGoal}
            onChange={(e) => setUserGoal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ex: implementar autenticacao OAuth com Google"
            rows={3}
            autoFocus
          />
        </div>

        <Button
          variant="primary"
          fullWidth
          onClick={() => void handleSubmit()}
          disabled={!userGoal.trim()}
        >
          Create Workspace
        </Button>
      </div>
    </DialogShell>
  );
}
