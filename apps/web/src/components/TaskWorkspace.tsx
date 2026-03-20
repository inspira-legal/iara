import { useState, useEffect } from "react";
import {
  GitBranch,
  ChevronLeft,
  CheckCircle2,
  Code,
  FolderOpen,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Sparkles,
} from "lucide-react";
import type { Task, Project, RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { useTerminalStore } from "~/stores/terminal";
import { useRegenerate } from "~/hooks/useRegenerate";
import { RegenerationBanner } from "./RegenerationBanner";
import { PromptPreview } from "./PromptPreview";
import { EnvEditor } from "./EnvEditor";
import { TerminalView } from "./TerminalView";
import { SessionList } from "./SessionList";

const FETCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface TaskWorkspaceProps {
  project: Project;
  task: Task;
}

export function TaskWorkspace({ project, task }: TaskWorkspaceProps) {
  const terminalEntry = useTerminalStore((s) => s.getEntry(task.id));
  const resetToSessions = useTerminalStore((s) => s.resetToSessions);
  const createTerminal = useTerminalStore((s) => s.create);
  const [repoInfo, setRepoInfo] = useState<RepoInfo[]>([]);
  const [repoLoading, setRepoLoading] = useState(true);

  // Determine view based on terminal store state
  // If there's an active/connecting terminal entry, show terminal
  const hasTerminal = terminalEntry.status !== "idle";

  // Track resumeSessionId for when user launches from session list
  const [pendingResumeSessionId, setPendingResumeSessionId] = useState<string | undefined>();

  // Auto-fetch repos every 5 minutes while a task is active
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

  const handleLaunchSession = (resumeSessionId?: string, sessionCwd?: string) => {
    setPendingResumeSessionId(resumeSessionId);
    void createTerminal(task.id, resumeSessionId, sessionCwd);
  };

  const handleBack = () => {
    resetToSessions(task.id);
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
            <div className="text-xs text-zinc-500">{project.name}</div>
            <div className="text-sm font-medium text-zinc-100">{task.name}</div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <GitBranch size={12} />
            <code className="rounded bg-zinc-800 px-1 py-0.5">{task.branch}</code>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              void transport.request("files.openInEditor", {
                projectId: project.id,
                taskId: task.id,
              })
            }
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Open in editor"
          >
            <Code size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              void transport.request("files.openInExplorer", {
                projectId: project.id,
                taskId: task.id,
              })
            }
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Open in file explorer"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {hasTerminal ? (
        <TerminalView
          taskId={task.id}
          {...(pendingResumeSessionId ? { resumeSessionId: pendingResumeSessionId } : {})}
        />
      ) : (
        <TaskDetailView
          project={project}
          task={task}
          repoInfo={repoInfo}
          repoLoading={repoLoading}
          hasActiveTerminal={hasTerminal}
          onLaunchSession={handleLaunchSession}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Detail View (sessions screen)
// ---------------------------------------------------------------------------

function TaskDetailView({
  project,
  task,
  repoInfo,
  repoLoading,
  hasActiveTerminal,
  onLaunchSession,
}: {
  project: Project;
  task: Task;
  repoInfo: RepoInfo[];
  repoLoading: boolean;
  hasActiveTerminal: boolean;
  onLaunchSession: (resumeSessionId?: string, sessionCwd?: string) => void;
}) {
  const {
    isRegenerating,
    showEmptyBanner,
    messages,
    result,
    error,
    handleStartRegenerate,
    cancel,
  } = useRegenerate({
    entityId: task.id,
    filePath: `${project.slug}/${task.slug}/TASK.md`,
    regenerateFn: () => transport.request("tasks.regenerate", { taskId: task.id }),
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <RegenerationBanner
        isRegenerating={isRegenerating}
        showEmptyBanner={showEmptyBanner}
        error={error}
        messages={messages}
        fileName="TASK.md"
        onGenerate={() => void handleStartRegenerate()}
        onCancel={cancel}
      />

      {/* Task info */}
      {task.description && (
        <div className="mb-6">
          <p className="text-sm text-zinc-400">{task.description}</p>
        </div>
      )}

      {/* System prompts */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-zinc-300">System Prompts</h3>
        <div className="space-y-1">
          <PromptPreview filePath={`${project.slug}/PROJECT.md`} label="PROJECT.md" />
          {!showEmptyBanner && !isRegenerating && (
            <PromptPreview
              filePath={`${project.slug}/${task.slug}/TASK.md`}
              label="TASK.md"
              refreshKey={result ? 1 : 0}
            />
          )}
        </div>
      </div>

      {/* Repos */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Repos</h3>
          {/* Regenerate button (CP-08) */}
          {!isRegenerating && !showEmptyBanner && (
            <button
              type="button"
              onClick={() => void handleStartRegenerate()}
              className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              title="Regenerate TASK.md"
            >
              <Sparkles size={12} />
              Regenerate TASK.md
            </button>
          )}
        </div>
        <div className="space-y-2">
          {repoLoading ? (
            Array.from({ length: 1 }, (_, i) => <RepoSkeleton key={i} />)
          ) : repoInfo.length === 0 ? (
            <p className="text-xs text-zinc-600">No repos configured.</p>
          ) : (
            repoInfo.map((repo) => <RepoCard key={repo.name} repo={repo} taskId={task.id} />)
          )}
        </div>
      </div>

      {/* Environment */}
      <div className="mb-6">
        <EnvEditor
          projectId={task.projectId}
          workspace={task.id}
          repos={repoInfo.map((r) => r.name)}
          hasActiveTerminal={hasActiveTerminal}
        />
      </div>

      {/* Sessions */}
      <div>
        <SessionList taskId={task.id} onLaunch={onLaunchSession} />
      </div>
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

function RepoCard({ repo, taskId }: { repo: RepoInfo; taskId?: string }) {
  const isClean = repo.dirtyCount === 0;
  const showAheadBehind = repo.ahead > 0 || repo.behind > 0;
  const [editing, setEditing] = useState(false);
  const [branchInput, setBranchInput] = useState(repo.branch);
  const [renaming, setRenaming] = useState(false);

  const handleRenameBranch = async () => {
    if (!taskId || branchInput.trim() === repo.branch || !branchInput.trim()) {
      setEditing(false);
      setBranchInput(repo.branch);
      return;
    }
    setRenaming(true);
    try {
      await transport.request("tasks.renameBranch", {
        taskId,
        repoName: repo.name,
        newBranch: branchInput.trim(),
      });
      setEditing(false);
    } catch {
      setBranchInput(repo.branch);
      setEditing(false);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
      <span className="min-w-0 shrink truncate text-sm font-bold text-zinc-100">{repo.name}</span>

      <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
        <GitBranch size={13} />
        {editing ? (
          <input
            type="text"
            value={branchInput}
            onChange={(e) => setBranchInput(e.target.value)}
            onBlur={() => void handleRenameBranch()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameBranch();
              if (e.key === "Escape") {
                setBranchInput(repo.branch);
                setEditing(false);
              }
            }}
            disabled={renaming}
            autoFocus
            className="w-32 rounded border border-zinc-600 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-300 outline-none focus:border-blue-500"
          />
        ) : (
          <button
            type="button"
            onClick={() => taskId && setEditing(true)}
            className={taskId ? "cursor-pointer hover:text-zinc-200" : ""}
            title={taskId ? "Click to rename branch" : undefined}
          >
            {repo.branch}
          </button>
        )}
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
    </div>
  );
}
