import { useEffect, useState } from "react";
import {
  FolderOpen,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { Project, RepoInfo } from "@iara/contracts";
import { useProjectStore } from "~/stores/projects";
import { transport } from "~/lib/ws-transport.js";
import { EditableName } from "./EditableName";
import { AddRepoDialog } from "./AddRepoDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { SessionList } from "./SessionList";

interface ProjectViewProps {
  project: Project;
}

function RepoSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="h-4 w-32 rounded bg-zinc-700" />
        <div className="h-4 w-20 rounded bg-zinc-700" />
        <div className="ml-auto h-4 w-16 rounded bg-zinc-700" />
      </div>
    </div>
  );
}

function RepoCard({ repo, onRemove }: { repo: RepoInfo; onRemove: () => void }) {
  const isClean = repo.dirtyCount === 0;
  const showAheadBehind = repo.ahead > 0 || repo.behind > 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
      <span className="min-w-0 shrink truncate text-sm font-bold text-zinc-100">{repo.name}</span>

      <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
        <GitBranch size={13} />
        {repo.branch}
      </span>

      {isClean ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-green-400">
          <CheckCircle2 size={13} />
          clean
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-xs text-red-400">
          <AlertCircle size={13} />
          {repo.dirtyCount} modified
        </span>
      )}

      {showAheadBehind && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          {repo.ahead > 0 && (
            <span className="flex items-center gap-0.5 text-green-400">
              <ArrowUp size={12} />
              {repo.ahead}
            </span>
          )}
          {repo.behind > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <ArrowDown size={12} />
              {repo.behind}
            </span>
          )}
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto shrink-0 rounded-md p-1 text-zinc-600 hover:bg-zinc-700 hover:text-red-400"
        title="Remove repo"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ProjectView({ project }: ProjectViewProps) {
  const [repoInfo, setRepoInfo] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<string | null>(null);
  const { updateProject } = useProjectStore();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    transport
      .request("repos.getInfo", { projectId: project.id })
      .then((info) => {
        if (!cancelled) {
          setRepoInfo(info);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRepoInfo([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const skeletonCount = project.repoSources.length || 1;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-zinc-500">
          <FolderOpen size={16} />
          <span className="text-xs">Project</span>
        </div>
        <EditableName
          value={project.name}
          onSave={async (newName) => {
            await updateProject(project.id, { name: newName });
          }}
        />
        <p className="mt-1 text-xs text-zinc-600">Slug: {project.slug}</p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Repos</h3>

        <div className="space-y-2">
          {loading
            ? Array.from({ length: skeletonCount }, (_, i) => <RepoSkeleton key={i} />)
            : repoInfo.map((repo) => (
                <RepoCard key={repo.name} repo={repo} onRemove={() => setRepoToDelete(repo.name)} />
              ))}
        </div>

        {!loading && repoInfo.length === 0 && (
          <p className="mt-3 text-xs text-zinc-600">No repos yet. Add a repo to get started.</p>
        )}

        <button
          type="button"
          onClick={() => setShowAddRepo(true)}
          className="mt-3 flex items-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
        >
          <Plus size={14} />
          Add Repo
        </button>
      </div>

      {/* Sessions */}
      <div className="mt-6">
        <SessionList projectId={project.id} />
      </div>

      <div className="mt-8 text-xs text-zinc-600">
        <p>Select or create a task to start working.</p>
      </div>

      <AddRepoDialog
        open={showAddRepo}
        onClose={() => setShowAddRepo(false)}
        onAdd={async (input) => {
          await transport.request("repos.add", { projectId: project.id, ...input });
          const info = await transport.request("repos.getInfo", { projectId: project.id });
          setRepoInfo(info);
        }}
      />

      <ConfirmDialog
        open={repoToDelete !== null}
        title="Remove Repo"
        description={`Remove "${repoToDelete}" from this project?`}
        details={
          <div className="mt-2 text-xs text-zinc-500">
            <p>
              The repo directory in .repos/ will be deleted. Worktrees in active tasks will be
              removed.
            </p>
          </div>
        }
        confirmText="Remove Repo"
        confirmVariant="danger"
        onConfirm={async () => {
          await updateProject(project.id, {
            repoSources: project.repoSources.filter((s) => {
              const name =
                s
                  .split("/")
                  .pop()
                  ?.replace(/\.git\/?$/, "") || s;
              return name !== repoToDelete;
            }),
          });
          setRepoToDelete(null);
          const info = await transport.request("repos.getInfo", { projectId: project.id });
          setRepoInfo(info);
        }}
        onCancel={() => setRepoToDelete(null)}
      />
    </div>
  );
}
