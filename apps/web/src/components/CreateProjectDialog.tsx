import { useState } from "react";
import { X, Plus, ArrowLeft, Loader2, GitBranch, FolderOpen, FileText } from "lucide-react";
import type { AddRepoInput } from "@iara/contracts";
import { useProjectStore } from "~/stores/projects";
import { transport } from "~/lib/ws-transport.js";
import { cn } from "~/lib/utils";
import { useToast } from "./Toast";
import { AddRepoDialog } from "./AddRepoDialog";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

type WizardStep = "info" | "repos";

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
  const [step, setStep] = useState<WizardStep>("info");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [pendingRepos, setPendingRepos] = useState<PendingRepo[]>([]);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const { projects, createProject, loadProjects } = useProjectStore();
  const { toast } = useToast();

  if (!open) return null;

  const computedSlug = slugManual ? slug : toSlug(name);
  const slugTaken = computedSlug !== "" && projects.some((p) => p.slug === computedSlug);
  const canGoToRepos = name.trim() !== "" && computedSlug !== "" && !slugTaken;
  const canCreate = pendingRepos.length > 0 && !submitting;

  const resetForm = () => {
    setStep("info");
    setName("");
    setSlug("");
    setSlugManual(false);
    setPendingRepos([]);
    setShowAddRepo(false);
    setSubmitting(false);
    setProgress("");
  };

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugManual) {
      setSlug(toSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugManual(true);
    setSlug(toSlug(value));
  };

  const handleNext = () => {
    if (!canGoToRepos) return;
    setStep("repos");
  };

  const handleBack = () => {
    setStep("info");
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

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      setProgress("Creating project...");
      const project = await createProject({
        name: name.trim(),
        slug: computedSlug,
        repoSources: [],
      });

      const total = pendingRepos.length;
      for (const [i, repo] of pendingRepos.entries()) {
        setProgress(`Adding repos (${i + 1}/${total})...`);
        await transport.request("repos.add", { projectId: project.id, ...repo.input });
      }

      // Reload projects to reflect added repos
      await loadProjects();

      toast("Project created", "success");
      resetForm();
      onClose();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === "repos" && !submitting && (
              <button
                type="button"
                onClick={handleBack}
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

        {/* Step indicator */}
        <div className="mb-4 flex gap-2">
          <StepIndicator label="1. Info" active={step === "info"} completed={step === "repos"} />
          <StepIndicator label="2. Repos" active={step === "repos"} completed={false} />
        </div>

        {/* Step 1: Project Info */}
        {step === "info" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My SaaS"
                autoFocus
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">Slug</label>
              <input
                type="text"
                value={computedSlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="my-saas"
                className={cn(
                  "w-full rounded-md border bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500",
                  slugTaken ? "border-red-500" : "border-zinc-700",
                )}
              />
              {slugTaken && (
                <p className="mt-1 text-xs text-red-400">A project with this slug already exists</p>
              )}
              {!slugManual && computedSlug !== "" && (
                <p className="mt-1 text-xs text-zinc-600">Auto-generated from name</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoToRepos}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Add Repos */}
        {step === "repos" && (
          <div className="space-y-4">
            {/* Pending repos list */}
            {pendingRepos.length > 0 ? (
              <div className="space-y-1">
                {pendingRepos.map((repo) => {
                  const Icon = METHOD_ICONS[repo.input.method] ?? FileText;
                  const methodLabel = METHOD_LABELS[repo.input.method] ?? repo.input.method;
                  return (
                    <div
                      key={repo.input.name}
                      className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2"
                    >
                      <Icon size={14} className="shrink-0 text-zinc-500" />
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                        {repo.input.name}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-600">{methodLabel}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRepo(repo.input.name)}
                        disabled={submitting}
                        className="shrink-0 rounded-md p-1 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-30"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-zinc-700 px-4 py-6 text-center text-sm text-zinc-600">
                No repos added yet. Add at least one to continue.
              </div>
            )}

            {/* Add repo button */}
            <button
              type="button"
              onClick={() => setShowAddRepo(true)}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
            >
              <Plus size={14} />
              Add Repo
            </button>

            {/* Progress indicator */}
            {submitting && progress && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 size={14} className="shrink-0 animate-spin text-blue-400" />
                <span>{progress}</span>
              </div>
            )}

            {/* Create button */}
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!canCreate}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        )}
      </div>

      {/* Sub-dialog for adding repos */}
      <AddRepoDialog
        open={showAddRepo}
        onClose={() => setShowAddRepo(false)}
        onAdd={handleAddPendingRepo}
      />
    </div>
  );
}

function StepIndicator({
  label,
  active,
  completed,
}: {
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium",
        active && "bg-blue-600/20 text-blue-400",
        completed && "bg-zinc-700/50 text-zinc-400",
        !active && !completed && "text-zinc-600",
      )}
    >
      {label}
    </div>
  );
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
