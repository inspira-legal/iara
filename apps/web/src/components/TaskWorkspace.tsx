import { GitBranch, Play, CheckCircle, Trash2 } from "lucide-react";
import type { Task, Project } from "@iara/contracts";

interface TaskWorkspaceProps {
  project: Project;
  task: Task;
  onLaunchClaude: () => void;
  onCompleteTask: () => void;
  onDeleteTask: () => void;
}

export function TaskWorkspace({
  project,
  task,
  onLaunchClaude,
  onCompleteTask,
  onDeleteTask,
}: TaskWorkspaceProps) {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6">
        <div className="mb-1 text-xs text-zinc-500">{project.name}</div>
        <h2 className="text-xl font-semibold text-zinc-100">{task.name}</h2>
        {task.description && <p className="mt-1 text-sm text-zinc-400">{task.description}</p>}
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
          <GitBranch size={14} />
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">{task.branch}</code>
        </div>
        <div className="text-xs text-zinc-500">
          Status:{" "}
          <span className={task.status === "active" ? "text-blue-400" : "text-green-400"}>
            {task.status}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {task.status === "active" && (
          <>
            <ActionButton icon={Play} label="Launch Claude" onClick={onLaunchClaude} primary />
            <ActionButton icon={CheckCircle} label="Complete" onClick={onCompleteTask} />
          </>
        )}
        <ActionButton icon={Trash2} label="Delete" onClick={onDeleteTask} destructive />
      </div>

      <div className="mt-8">
        <h3 className="mb-2 text-sm font-medium text-zinc-300">Repos</h3>
        <ul className="space-y-1">
          {project.repoSources.map((repo) => (
            <li key={repo} className="text-xs text-zinc-500">
              <code>{repo}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
  destructive,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
  destructive?: boolean;
}) {
  const base =
    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const variant = primary
    ? "bg-blue-600 text-white hover:bg-blue-500"
    : destructive
      ? "text-red-400 hover:bg-red-950 hover:text-red-300"
      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300";

  return (
    <button type="button" onClick={onClick} className={`${base} ${variant}`}>
      <Icon size={14} />
      {label}
    </button>
  );
}
