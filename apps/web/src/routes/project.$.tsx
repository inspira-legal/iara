import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GitBranch, GitFork, Plus, Sparkles, Trash2 } from "lucide-react";
import type { RepoInfo } from "@iara/contracts";
import { useAppStore } from "~/stores/app";
import { useRegenerate } from "~/hooks/useRegenerate";
import { transport } from "~/lib/ws-transport";
import { ClaudeMdView } from "~/components/ClaudeMdView";
import { RepoCard } from "~/components/RepoCard";
import { AddRepoDialog } from "~/components/AddRepoDialog";
import { RegenerationBanner } from "~/components/RegenerationBanner";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { CreateWorkspaceDialog } from "~/components/CreateWorkspaceDialog";
import { Button } from "~/components/ui/Button";
import { SectionHeader } from "~/components/ui/SectionHeader";
import { EmptyState } from "~/components/ui/EmptyState";

export const Route = createFileRoute("/project/$")({
  component: ProjectPage,
});

function ProjectPage() {
  const { _splat: projectId } = Route.useParams();
  const navigate = useNavigate();

  const project = useAppStore((s) => s.getProject(projectId!));

  useEffect(() => {
    if (!project) {
      void navigate({ to: "/" });
    }
  }, [project, navigate]);

  if (!project || !projectId) return null;

  const mainWorkspace = project.workspaces.find((w) => w.slug === "main");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-6">
        <h1 className="text-sm font-semibold text-zinc-200">{project.name}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl space-y-8">
          {/* CLAUDE.md */}
          <div>
            <SectionHeader title="CLAUDE.md" />
            <ClaudeMdView filePath={`${project.slug}/CLAUDE.md`} />
          </div>

          {/* Project management */}
          {mainWorkspace && (
            <ProjectManagement project={project} mainWorkspaceId={mainWorkspace.id} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectManagement({
  project,
  mainWorkspaceId,
}: {
  project: {
    id: string;
    slug: string;
    name: string;
    workspaces: { id: string; slug: string; name: string }[];
  };
  mainWorkspaceId: string;
}) {
  const cacheKey = mainWorkspaceId;
  const repoInfo = useAppStore((s) => s.getRepoInfo(cacheKey));
  const refreshRepoInfo = useAppStore((s) => s.refreshRepoInfo);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace);

  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<string | null>(null);
  const [showDeleteProject, setShowDeleteProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deletingRepo, setDeletingRepo] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

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

  useEffect(() => {
    void refreshRepoInfo(project.id, cacheKey, mainWorkspaceId);
  }, [project.id, cacheKey, mainWorkspaceId, refreshRepoInfo]);

  const updateRepoInfo = (info: RepoInfo[]) => {
    useAppStore.setState((s) => ({
      repoInfo: { ...s.repoInfo, [cacheKey]: info },
    }));
  };

  return (
    <>
      {/* Regeneration */}
      <div>
        <SectionHeader
          title="Regenerate CLAUDE.md"
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
      </div>

      {/* Repos */}
      <div>
        <SectionHeader title="Repos" />
        <div className="space-y-2">
          {repoInfo.length === 0 ? (
            <EmptyState icon={GitFork} message="No repos yet. Add a repo to get started." />
          ) : (
            repoInfo.map((repo) => (
              <RepoCard
                key={repo.name}
                repo={repo}
                showStatus={false}
                onRemove={() => setRepoToDelete(repo.name)}
              />
            ))
          )}
        </div>
        <Button variant="dashed" size="sm" className="mt-3" onClick={() => setShowAddRepo(true)}>
          <Plus size={14} />
          Add Repo
        </Button>
      </div>

      {/* Workspaces */}
      <div>
        <SectionHeader title="Workspaces" />
        <div className="space-y-1">
          {project.workspaces.map((ws) => (
            <WorkspaceRow
              key={ws.id}
              workspace={ws}
              onDelete={ws.slug !== "main" ? () => setWorkspaceToDelete(ws) : undefined}
            />
          ))}
        </div>
        <Button
          variant="dashed"
          size="sm"
          className="mt-3"
          onClick={() => setCreateWorkspaceOpen(true)}
        >
          <Plus size={14} />
          Create Workspace
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
        loading={deletingRepo}
        onConfirm={async () => {
          setDeletingRepo(true);
          try {
            const info = await transport.request("repos.getInfo", { projectId: project.id });
            updateRepoInfo(info);
          } finally {
            setDeletingRepo(false);
          }
          setRepoToDelete(null);
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
        loading={deletingProject}
        onConfirm={async () => {
          setDeletingProject(true);
          try {
            await deleteProject(project.id);
          } finally {
            setDeletingProject(false);
          }
          setShowDeleteProject(false);
        }}
        onCancel={() => setShowDeleteProject(false)}
      />

      <ConfirmDialog
        open={workspaceToDelete !== null}
        title="Delete Workspace"
        description={`Delete "${workspaceToDelete?.name}"?`}
        details={
          <div className="mt-2 text-xs text-zinc-500">
            <p>All worktrees and workspace files will be permanently deleted.</p>
          </div>
        }
        confirmText="Delete Workspace"
        confirmVariant="danger"
        loading={deletingWorkspace}
        onConfirm={async () => {
          if (!workspaceToDelete) return;
          setDeletingWorkspace(true);
          try {
            await deleteWorkspace(workspaceToDelete.id);
          } finally {
            setDeletingWorkspace(false);
          }
          setWorkspaceToDelete(null);
        }}
        onCancel={() => setWorkspaceToDelete(null)}
      />

      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onClose={() => setCreateWorkspaceOpen(false)}
        projectId={project.id}
      />
    </>
  );
}

function WorkspaceRow({
  workspace,
  onDelete,
}: {
  workspace: { id: string; slug: string; name: string; branch?: string };
  onDelete?: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  const isMain = workspace.slug === "main";

  return (
    <button
      type="button"
      onClick={() => void navigate({ to: `/workspace/${workspace.id}` } as any)}
      className="group flex w-full items-center gap-3 rounded-lg border border-zinc-800 px-4 py-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/40"
    >
      <GitBranch size={14} className="shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <span className="text-sm text-zinc-200">{workspace.name}</span>
        {workspace.branch && <span className="ml-2 text-xs text-zinc-500">{workspace.branch}</span>}
      </div>
      {isMain && (
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
          default
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100"
          aria-label={`Delete ${workspace.name}`}
        >
          <Trash2 size={13} />
        </button>
      )}
    </button>
  );
}
