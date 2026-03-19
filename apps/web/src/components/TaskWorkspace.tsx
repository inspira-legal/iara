import { useEffect, useState } from "react";
import {
  GitBranch,
  CheckCircle,
  Trash2,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Calendar,
} from "lucide-react";
import type { Task, Project, RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { useTerminalStore } from "~/stores/terminal";
import { TerminalView } from "./TerminalView";
import { SessionList } from "./SessionList";

const FETCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface TaskWorkspaceProps {
  project: Project;
  task: Task;
  onCompleteTask: () => void;
  onDeleteTask: () => void;
}

export function TaskWorkspace({ project, task, onCompleteTask, onDeleteTask }: TaskWorkspaceProps) {
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

  const handleLaunchSession = (resumeSessionId?: string) => {
    setPendingResumeSessionId(resumeSessionId);
    void createTerminal(task.id, resumeSessionId);
  };

  const handleBack = () => {
    resetToSessions(task.id);
    setPendingResumeSessionId(undefined);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          {hasTerminal && (
            <button
              type="button"
              onClick={handleBack}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              title="Voltar para sessões"
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
          <div className="text-xs text-zinc-500">
            <span className={task.status === "active" ? "text-blue-400" : "text-green-400"}>
              {task.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {task.status === "active" && (
            <HeaderButton icon={CheckCircle} label="Complete" onClick={onCompleteTask} />
          )}
          <HeaderButton icon={Trash2} label="Delete" onClick={onDeleteTask} destructive />
        </div>
      </div>

      {/* Content */}
      {hasTerminal ? (
        task.status === "active" ? (
          <TerminalView
            taskId={task.id}
            {...(pendingResumeSessionId ? { resumeSessionId: pendingResumeSessionId } : {})}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
            Task completed
          </div>
        )
      ) : (
        <TaskDetailView
          task={task}
          repoInfo={repoInfo}
          repoLoading={repoLoading}
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
  task,
  repoInfo,
  repoLoading,
  onLaunchSession,
}: {
  task: Task;
  repoInfo: RepoInfo[];
  repoLoading: boolean;
  onLaunchSession: (resumeSessionId?: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Task info */}
      <div className="mb-6">
        {task.description && <p className="mb-2 text-sm text-zinc-400">{task.description}</p>}
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {formatDate(task.createdAt)}
          </span>
        </div>
      </div>

      {/* Repos */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Repos</h3>
        <div className="space-y-2">
          {repoLoading ? (
            Array.from({ length: 1 }, (_, i) => <RepoSkeleton key={i} />)
          ) : repoInfo.length === 0 ? (
            <p className="text-xs text-zinc-600">No repos configured.</p>
          ) : (
            repoInfo.map((repo) => <RepoCard key={repo.name} repo={repo} />)
          )}
        </div>
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

function RepoCard({ repo }: { repo: RepoInfo }) {
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

function HeaderButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  const classes = destructive
    ? "text-zinc-500 hover:text-red-400 hover:bg-red-950"
    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${classes}`}
      title={label}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "agora";
    if (diffMins < 60) return `${diffMins}m atrás`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d atrás`;

    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
