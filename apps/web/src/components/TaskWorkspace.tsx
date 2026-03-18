import { useEffect } from "react";
import { GitBranch, CheckCircle, Trash2 } from "lucide-react";
import type { Task, Project } from "@iara/contracts";
import { ensureNativeApi } from "~/nativeApi";
import { TerminalView } from "./TerminalView";

const FETCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface TaskWorkspaceProps {
  project: Project;
  task: Task;
  onCompleteTask: () => void;
  onDeleteTask: () => void;
}

export function TaskWorkspace({ project, task, onCompleteTask, onDeleteTask }: TaskWorkspaceProps) {
  // Auto-fetch repos every 5 minutes while a task is active
  useEffect(() => {
    const doFetch = () => {
      try {
        void ensureNativeApi().fetchRepos(project.id);
      } catch {
        // Not in Electron
      }
    };

    // Fetch immediately on task select
    doFetch();
    const id = setInterval(doFetch, FETCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [project.id]);
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
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

      {/* Terminal */}
      {task.status === "active" ? (
        <TerminalView taskId={task.id} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
          Task completed
        </div>
      )}
    </div>
  );
}

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
