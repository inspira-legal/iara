import { useEffect, useState } from "react";
import {
  GitBranch,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
} from "lucide-react";
import type { Project, RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { useProjectStore } from "~/stores/projects";
import { useTerminalStore } from "~/stores/terminal";
import { EnvEditor } from "./EnvEditor";
import { TerminalView } from "./TerminalView";
import { SessionList } from "./SessionList";
import { AddRepoDialog } from "./AddRepoDialog";
import { ConfirmDialog } from "./ConfirmDialog";

const FETCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface ProjectRootWorkspaceProps {
  project: Project;
}

export function ProjectRootWorkspace({ project }: ProjectRootWorkspaceProps) {
  const rootKey = `root:${project.id}`;
  const terminalEntry = useTerminalStore((s) => s.getEntry(rootKey));
  const resetToSessions = useTerminalStore((s) => s.resetToSessions);
  const createRoot = useTerminalStore((s) => s.createRoot);
  const [repoInfo, setRepoInfo] = useState<RepoInfo[]>([]);
  const [repoLoading, setRepoLoading] = useState(true);

  const hasTerminal = terminalEntry.status !== "idle";

  const [pendingResumeSessionId, setPendingResumeSessionId] = useState<string | undefined>();

  // Auto-fetch repos every 5 minutes
  useEffect(() => {
    const doFetch = () => {
      void transport.request("repos.fetch", { projectId: project.id }).catch(() => {});
    };

    doFetch();
    const id = setInterval(doFetch, FETCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [project.id]);

  // Load repo info
  useEffect(() => {
    let cancelled = false;
    setRepoLoading(true);

    transport
      .request("repos.getInfo", { projectId: project.id })
      .then((info) => {
        if (!cancelled) {
          setRepoInfo(info);
          setRepoLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRepoInfo([]);
          setRepoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const handleLaunchSession = (resumeSessionId?: string) => {
    setPendingResumeSessionId(resumeSessionId);
    void createRoot(project.id, resumeSessionId);
  };

  const handleBack = () => {
    resetToSessions(rootKey);
    setPendingResumeSessionId(undefined);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          {hasTerminal && (
            <button
              type="button"
              onClick={handleBack}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              title="Back to sessions"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div>
            <div className="text-sm font-medium text-zinc-100">{project.name}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      {hasTerminal ? (
        <TerminalView
          taskId={rootKey}
          {...(pendingResumeSessionId ? { resumeSessionId: pendingResumeSessionId } : {})}
        />
      ) : (
        <ProjectRootDetailView
          project={project}
          repoInfo={repoInfo}
          repoLoading={repoLoading}
          setRepoInfo={setRepoInfo}
          onLaunchSession={handleLaunchSession}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project Root Detail View (sessions screen)
// ---------------------------------------------------------------------------

function ProjectRootDetailView({
  project,
  repoInfo,
  repoLoading,
  setRepoInfo,
  onLaunchSession,
}: {
  project: Project;
  repoInfo: RepoInfo[];
  repoLoading: boolean;
  setRepoInfo: (info: RepoInfo[]) => void;
  onLaunchSession: (resumeSessionId?: string) => void;
}) {
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<string | null>(null);
  const { updateProject } = useProjectStore();

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Repos */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Repos</h3>
        <div className="space-y-2">
          {repoLoading ? (
            Array.from({ length: project.repoSources.length || 1 }, (_, i) => (
              <RepoSkeleton key={i} />
            ))
          ) : repoInfo.length === 0 ? (
            <p className="text-xs text-zinc-600">No repos yet. Add a repo to get started.</p>
          ) : (
            repoInfo.map((repo) => (
              <RepoCard key={repo.name} repo={repo} onRemove={() => setRepoToDelete(repo.name)} />
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowAddRepo(true)}
          className="mt-3 flex items-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
        >
          <Plus size={14} />
          Add Repo
        </button>
      </div>

      {/* Environment */}
      <div className="mb-6">
        <EnvEditor projectId={project.id} context="root" repos={repoInfo.map((r) => r.name)} />
      </div>

      {/* Sessions */}
      <div>
        <SessionList projectId={project.id} onLaunch={onLaunchSession} />
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
              The repo directory in default/ will be deleted. Worktrees in active tasks will be
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

// ---------------------------------------------------------------------------
// Repo components
// ---------------------------------------------------------------------------

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
