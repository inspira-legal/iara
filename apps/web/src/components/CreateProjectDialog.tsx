import { useState } from "react";
import { Plus, GitBranch, FolderOpen, FileText, X } from "lucide-react";
import type { AddRepoInput } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { useToast } from "./Toast";
import { AddRepoDialog } from "./AddRepoDialog";
import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";
import { Label } from "./ui/Label";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = "repos" | "prompt";

interface PendingRepo {
  input: AddRepoInput;
}

const METHOD_ICONS: Record<string, typeof GitBranch> = {
  "git-url": GitBranch,
  "local-folder": FolderOpen,
  empty: FileText,
};

const METHOD_LABELS: Record<string, string> = {
  "git-url": "Git URL",
  "local-folder": "Local Folder",
  empty: "New Repo",
};

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const [step, setStep] = useState<Step>("repos");
  const [pendingRepos, setPendingRepos] = useState<PendingRepo[]>([]);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [userGoal, setUserGoal] = useState("");
  const { toast } = useToast();

  const resetForm = () => {
    setStep("repos");
    setPendingRepos([]);
    setShowAddRepo(false);
    setUserGoal("");
  };

  if (!open) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleAddPendingRepo = async (input: AddRepoInput): Promise<void> => {
    if (pendingRepos.some((r) => r.input.name === input.name)) {
      throw new Error(`Repo "${input.name}" already added`);
    }
    if (input.method === "git-url" && input.url) {
      await transport.request("repos.validateUrl", { url: input.url });
    }
    setPendingRepos((prev) => [...prev, { input }]);
  };

  const handleRemoveRepo = (repoName: string) => {
    setPendingRepos((prev) => prev.filter((r) => r.input.name !== repoName));
  };

  const handleSubmit = async () => {
    if (!userGoal.trim()) return;

    const repoSources = pendingRepos.map((r) => {
      if (r.input.method === "git-url" && r.input.url) return r.input.url;
      if (r.input.method === "local-folder" && r.input.folderPath) return r.input.folderPath;
      return r.input.name;
    });

    try {
      await transport.request("projects.createFromPrompt", {
        repoSources,
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

  const backButton = step === "prompt" ? () => setStep("repos") : undefined;

  return (
    <DialogShell open={open} title="New Project" onClose={handleClose} backButton={backButton}>
      {/* Step 1: Add Repos */}
      {step === "repos" && (
        <div className="space-y-4">
          {pendingRepos.length === 0 ? (
            <p className="text-sm text-zinc-500">Add at least one repo to get started.</p>
          ) : (
            <ul className="space-y-2">
              {pendingRepos.map((repo) => {
                const Icon = METHOD_ICONS[repo.input.method] ?? GitBranch;
                return (
                  <li
                    key={repo.input.name}
                    className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-zinc-500" />
                      <span className="text-sm text-zinc-200">{repo.input.name}</span>
                      <span className="text-xs text-zinc-500">
                        {METHOD_LABELS[repo.input.method]}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRepo(repo.input.name)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <Button variant="dashed" fullWidth onClick={() => setShowAddRepo(true)}>
            <Plus size={14} />
            Add Repo
          </Button>

          <Button
            variant="primary"
            fullWidth
            onClick={() => setStep("prompt")}
            disabled={pendingRepos.length === 0}
          >
            Next
          </Button>
        </div>
      )}

      {/* Step 2: Prompt */}
      {step === "prompt" && (
        <div className="space-y-4">
          <div>
            <Label>What&apos;s this project about?</Label>
            <Textarea
              value={userGoal}
              onChange={(e) => setUserGoal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ex: workspace manager for Claude Code users"
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
            Create Project
          </Button>
        </div>
      )}

      {/* Add Repo Dialog */}
      {showAddRepo && (
        <AddRepoDialog
          open={showAddRepo}
          onClose={() => setShowAddRepo(false)}
          onAdd={handleAddPendingRepo}
        />
      )}
    </DialogShell>
  );
}
