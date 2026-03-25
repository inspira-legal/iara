import { useState, useEffect } from "react";
import { ChevronLeft, GitFork, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Project, RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { useAppStore } from "~/stores/app";
import { usePanelsStore } from "~/stores/panels";
import { useRegenerate } from "~/hooks/useRegenerate";
import { RepoCard } from "./RepoCard";
import { AddRepoDialog } from "./AddRepoDialog";
import { RegenerationBanner } from "./RegenerationBanner";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";
import { EmptyState } from "./ui/EmptyState";

interface EditProjectViewProps {
  project: Project;
}

export function EditProjectView({ project }: EditProjectViewProps) {
  const mainWorkspace = project.workspaces.find((w) => w.slug === "main");
  const cacheKey = mainWorkspace?.id ?? project.id;
  const repoInfo = useAppStore((s) => s.getRepoInfo(cacheKey));
  const refreshRepoInfo = useAppStore((s) => s.refreshRepoInfo);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const setEditingProjectId = usePanelsStore((s) => s.setEditingProjectId);

  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<string | null>(null);
  const [showDeleteProject, setShowDeleteProject] = useState(false);

  const { isRegenerating, showEmptyBanner, messages, error, handleStartRegenerate, cancel } =
    useRegenerate({
      entityId: `edit:${project.id}`,
      filePath: `${project.slug}/CLAUDE.md`,
      regenerateFn: () =>
        transport.request("projects.analyze", {
          projectId: project.id,
          description: "",
        }),
    });

  // Load repo info
  useEffect(() => {
    if (mainWorkspace) {
      void refreshRepoInfo(project.id, cacheKey, mainWorkspace.id);
    }
  }, [project.id, cacheKey, mainWorkspace, refreshRepoInfo]);

  const updateRepoInfo = (info: RepoInfo[]) => {
    useAppStore.setState((s) => ({
      repoInfo: { ...s.repoInfo, [cacheKey]: info },
    }));
  };

  const handleBack = () => {
    setEditingProjectId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} title="Back to workspace">
            <ChevronLeft size={16} />
          </Button>
          <div>
            <div className="text-xs text-zinc-500">Edit Project</div>
            <div className="text-sm font-medium text-zinc-100">{project.name}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* CLAUDE.md Regeneration */}
        <div className="mb-8">
          <SectionHeader
            title="CLAUDE.md"
            action={
              !isRegenerating && !showEmptyBanner ? (
                <Button
                  variant="action"
                  size="sm"
                  onClick={() => void handleStartRegenerate()}
                  title="Regenerate CLAUDE.md"
                >
                  <Sparkles size={12} />
                  Regenerate
                </Button>
              ) : undefined
            }
          />
          <RegenerationBanner
            isRegenerating={isRegenerating}
            showEmptyBanner={showEmptyBanner}
            error={error}
            messages={messages}
            fileName="CLAUDE.md"
            onGenerate={() => void handleStartRegenerate()}
            onCancel={cancel}
          />
          {!showEmptyBanner && !isRegenerating && !error && (
            <p className="text-xs text-zinc-500">
              CLAUDE.md is configured. Use "Regenerate" to update it based on current repos.
            </p>
          )}
        </div>

        {/* Repos */}
        <div className="mb-8">
          <SectionHeader title="Repos" />
          <div className="space-y-2">
            {repoInfo.length === 0 ? (
              <EmptyState icon={GitFork} message="No repos yet. Add a repo to get started." />
            ) : (
              repoInfo.map((repo) => (
                <RepoCard key={repo.name} repo={repo} onRemove={() => setRepoToDelete(repo.name)} />
              ))
            )}
          </div>
          <Button variant="dashed" size="sm" className="mt-3" onClick={() => setShowAddRepo(true)}>
            <Plus size={14} />
            Add Repo
          </Button>
        </div>

        {/* Danger Zone */}
        <div>
          <SectionHeader title="Danger Zone" />
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">Delete Project</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Permanently delete this project and all its workspaces.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setShowDeleteProject(true)}>
                <Trash2 size={12} />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <AddRepoDialog
        open={showAddRepo}
        onClose={() => setShowAddRepo(false)}
        onAdd={async (input) => {
          await transport.request("repos.add", { projectId: project.id, ...input });
          const info = await transport.request("repos.getInfo", { projectId: project.id });
          updateRepoInfo(info);
        }}
      />

      <ConfirmDialog
        open={repoToDelete !== null}
        title="Remove Repo"
        description={`Remove "${repoToDelete}" from this project?`}
        details={
          <div className="mt-2 text-xs text-zinc-500">
            <p>
              The repo directory in default/ will be deleted. Worktrees in active workspaces will be
              removed.
            </p>
          </div>
        }
        confirmText="Remove Repo"
        confirmVariant="danger"
        onConfirm={async () => {
          setRepoToDelete(null);
          const info = await transport.request("repos.getInfo", { projectId: project.id });
          updateRepoInfo(info);
        }}
        onCancel={() => setRepoToDelete(null)}
      />

      <ConfirmDialog
        open={showDeleteProject}
        title="Delete Project"
        description={`Delete "${project.name}"? This action cannot be undone.`}
        details={
          <div className="mt-2 text-xs text-zinc-500">
            <p>All workspaces, worktrees, and project files will be permanently deleted.</p>
          </div>
        }
        confirmText="Delete Project"
        confirmVariant="danger"
        onConfirm={async () => {
          setShowDeleteProject(false);
          setEditingProjectId(null);
          await deleteProject(project.id);
        }}
        onCancel={() => setShowDeleteProject(false)}
      />
    </div>
  );
}
