import { useState } from "react";
import {
  X,
  Plus,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertTriangle,
  GitBranch,
  FolderOpen,
  FileText,
} from "lucide-react";
import type { AddRepoInput } from "@iara/contracts";
import { useProjectStore } from "~/stores/projects";
import { useSidebarStore } from "~/stores/sidebar";
import { useRegenerateStore } from "~/stores/regenerate";
import { transport } from "~/lib/ws-transport.js";
import { toSlug } from "~/lib/utils";
import { useToast } from "./Toast";
import { AddRepoDialog } from "./AddRepoDialog";

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

  // Review fields (from Claude suggestion)
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [claudeError, setClaudeError] = useState<string | null>(null);

  const { projects, createProject, loadProjects } = useProjectStore();
  const { expandProject } = useSidebarStore();
  const { toast } = useToast();

  const computedSlug = toSlug(name);
  const slugTaken = computedSlug !== "" && projects.some((p) => p.slug === computedSlug);

  if (!open) return null;

  const resetForm = () => {
    setStep("repos");
    setPendingRepos([]);
    setShowAddRepo(false);
    setUserGoal("");
    setName("");
    setDescription("");
    setSubmitting(false);
    setProgress("");
    setClaudeError(null);
  };

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

  const handleAskClaude = async () => {
    if (!userGoal.trim()) return;
    setStep("loading");
    setClaudeError(null);

    try {
      const result = await transport.request("projects.suggest", {
        userGoal: userGoal.trim(),
      });
      setName(result.name);
      setDescription(result.description);
      setStep("review");
    } catch (err) {
      setClaudeError(err instanceof Error ? err.message : String(err));
      setName("");
      setDescription("");
      setStep("review");
    }
  };

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

      // Start analysis via regenerate store — workspace will show progress
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === "input" && (
              <button
                type="button"
                onClick={() => setStep("repos")}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            {step === "review" && (
              <button
                type="button"
                onClick={() => setStep("input")}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-semibold text-zinc-100">New Project</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>

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

            <button
              type="button"
              onClick={() => setShowAddRepo(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
            >
              <Plus size={14} />
              Add Repo
            </button>

            <button
              type="button"
              onClick={() => setStep("input")}
              disabled={pendingRepos.length === 0}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Free text input */}
        {step === "input" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                What&apos;s this project about?
              </label>
              <textarea
                value={userGoal}
                onChange={(e) => setUserGoal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ex: workspace manager for Claude Code users"
                rows={3}
                autoFocus
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleAskClaude()}
              disabled={!userGoal.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <Sparkles size={14} />
              Ask Claude
            </button>
          </div>
        )}

        {/* Step 3: Loading */}
        {step === "loading" && (
          <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
            <Loader2 size={14} className="shrink-0 animate-spin text-blue-400" />
            <span>Claude is analyzing...</span>
          </div>
        )}

        {/* Step 4: Review & Edit */}
        {step === "review" && (
          <div className="space-y-4">
            {claudeError && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-700/50 bg-yellow-900/20 px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow-400" />
                <div>
                  <p className="text-sm text-yellow-300">
                    Claude could not generate a suggestion. Fill the fields manually.
                  </p>
                  <p className="mt-1 text-xs text-yellow-400/70">{claudeError}</p>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm text-zinc-400">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                autoFocus
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
              />
            </div>

            {slugTaken && (
              <p className="text-xs text-red-400">A project with this name already exists</p>
            )}

            <div>
              <label className="mb-1 block text-sm text-zinc-400">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this project does..."
                rows={2}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleAskClaude()}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
              >
                <Sparkles size={14} />
                Re-generate
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!name.trim() || !computedSlug || slugTaken}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Create Project
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Creating */}
        {step === "creating" && (
          <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
            <Loader2 size={14} className="shrink-0 animate-spin text-blue-400" />
            <span>{progress}</span>
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
      </div>
    </div>
  );
}
