import { useState, useCallback } from "react";
import {
  Plus,
  Sparkles,
  AlertTriangle,
  GitBranch,
  FolderOpen,
  FileText,
  X,
} from "lucide-react";
import type { AddRepoInput } from "@iara/contracts";
import { useProjectStore } from "~/stores/projects";
import { useSidebarStore } from "~/stores/sidebar";
import { useRegenerateStore } from "~/stores/regenerate";
import { transport } from "~/lib/ws-transport.js";
import { toSlug } from "~/lib/utils";
import { useClaudeSuggestion } from "~/hooks/useClaudeSuggestion";
import { useToast } from "./Toast";
import { AddRepoDialog } from "./AddRepoDialog";
import { ClaudeProgressLine } from "./ClaudeProgressLine";
import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Textarea } from "./ui/Textarea";
import { Label } from "./ui/Label";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

type WizardStep = "repos" | "input" | "loading" | "review" | "creating";

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
  empty: "Empty",
};

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const [step, setStep] = useState<WizardStep>("repos");
  const [pendingRepos, setPendingRepos] = useState<PendingRepo[]>([]);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [userGoal, setUserGoal] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");

  const { projects, createProject, loadProjects } = useProjectStore();
  const { expandProject } = useSidebarStore();
  const { toast } = useToast();

  const computedSlug = toSlug(name);
  const slugTaken = computedSlug !== "" && projects.some((p) => p.slug === computedSlug);

  const claude = useClaudeSuggestion({
    requestFn: (userGoal) => transport.request("projects.suggest", { userGoal }),
    onResult: (data) => {
      try {
        const parsed = JSON.parse(data.content);
        setName(parsed.name ?? "");
        setDescription(parsed.description ?? "");
      } catch {
        setName("");
        setDescription("");
      }
      setStep("review");
    },
    onError: () => {
      setName("");
      setDescription("");
      setStep("review");
    },
  });

  const resetForm = () => {
    claude.reset();
    setStep("repos");
    setPendingRepos([]);
    setShowAddRepo(false);
    setUserGoal("");
    setName("");
    setDescription("");
    setSubmitting(false);
    setProgress("");
  };

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleAddPendingRepo = async (input: AddRepoInput): Promise<void> => {
    if (pendingRepos.some((r) => r.input.name === input.name)) {
      throw new Error(`Repo "${input.name}" already added`);
    }
    setPendingRepos((prev) => [...prev, { input }]);
  };

  const handleRemoveRepo = (repoName: string) => {
    setPendingRepos((prev) => prev.filter((r) => r.input.name !== repoName));
  };

  const handleAskClaude = useCallback(async () => {
    if (!userGoal.trim()) return;
    setStep("loading");
    await claude.ask(userGoal);
  }, [userGoal, claude]);

  const handleCreate = async () => {
    if (!name.trim() || !computedSlug || slugTaken) return;
    setSubmitting(true);
    setStep("creating");

    try {
      setProgress("Creating project...");
      const project = await createProject({
        name: name.trim(),
        slug: computedSlug,
        description: description.trim(),
        repoSources: [],
      });

      const total = pendingRepos.length;
      for (const [i, repo] of pendingRepos.entries()) {
        setProgress(`Adding repos (${i + 1}/${total})...`);
        await transport.request("repos.add", { projectId: project.id, ...repo.input });
      }

      await loadProjects();
      expandProject(project.id);

      void useRegenerateStore
        .getState()
        .startRegenerate(project.id, `${computedSlug}/PROJECT.md`, () =>
          transport.request("projects.analyze", {
            projectId: project.id,
            description: description.trim(),
          }),
        );

      toast("Project created", "success");
      resetForm();
      onClose();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      setSubmitting(false);
      setStep("review");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && userGoal.trim()) {
      e.preventDefault();
      void handleAskClaude();
    }
  };

  const backButton =
    step === "input" ? () => setStep("repos") :
    step === "review" ? () => setStep("input") :
    undefined;

  return (
    <DialogShell
      open={open}
      title="New Project"
      onClose={handleClose}
      disabled={submitting}
      backButton={backButton}
    >
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

          <Button
            variant="dashed"
            fullWidth
            onClick={() => setShowAddRepo(true)}
          >
            <Plus size={14} />
            Add Repo
          </Button>

          <Button
            variant="primary"
            fullWidth
            onClick={() => setStep("input")}
            disabled={pendingRepos.length === 0}
          >
            Next
          </Button>
        </div>
      )}

      {/* Step 2: Free text input */}
      {step === "input" && (
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
            onClick={() => void handleAskClaude()}
            disabled={!userGoal.trim()}
          >
            <Sparkles size={14} />
            Ask Claude
          </Button>
        </div>
      )}

      {/* Step 3: Loading */}
      {step === "loading" && (
        <div className="space-y-2 py-4">
          <Spinner text="Claude is analyzing..." />
          {claude.messages.length > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              {claude.messages.map((msg, i) => (
                <ClaudeProgressLine key={i} progress={msg} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Review & Edit */}
      {step === "review" && (
        <div className="space-y-4">
          {claude.error && (
            <Alert variant="warning" icon={<AlertTriangle size={14} className="text-yellow-400" />}>
              <p className="text-sm text-yellow-300">
                Claude could not generate a suggestion. Fill the fields manually.
              </p>
              <p className="mt-1 text-xs text-yellow-400/70">{claude.error}</p>
            </Alert>
          )}

          <div>
            <Label>Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              autoFocus
            />
          </div>

          {slugTaken && (
            <p className="text-xs text-red-400">A project with this name already exists</p>
          )}

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this project does..."
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => void handleAskClaude()}
            >
              <Sparkles size={14} />
              Re-generate
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => void handleCreate()}
              disabled={!name.trim() || !computedSlug || slugTaken}
            >
              Create Project
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Creating */}
      {step === "creating" && (
        <div className="py-8">
          <Spinner text={progress} />
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
