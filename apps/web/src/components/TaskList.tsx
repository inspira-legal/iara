import { useEffect } from "react";
import { GitBranch, CheckCircle2 } from "lucide-react";
import { useTaskStore } from "~/stores/tasks";
import { cn } from "~/lib/utils";

interface TaskListProps {
  projectId: string;
}

export function TaskList({ projectId }: TaskListProps) {
  const { tasks, selectedTaskId, loading, loadTasks, selectTask } = useTaskStore();

  useEffect(() => {
    void loadTasks(projectId);
  }, [projectId, loadTasks]);

  if (loading) {
    return <p className="px-2 py-4 text-center text-xs text-zinc-600">Loading...</p>;
  }

  if (tasks.length === 0) {
    return <p className="px-2 py-4 text-center text-xs text-zinc-600">No tasks yet</p>;
  }

  return (
    <ul className="space-y-0.5">
      {tasks.map((task) => (
        <li key={task.id}>
          <button
            type="button"
            onClick={() => selectTask(task.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              selectedTaskId === task.id
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300",
            )}
          >
            {task.status === "completed" ? (
              <CheckCircle2 size={14} className="shrink-0 text-green-500" />
            ) : (
              <GitBranch size={14} className="shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <span className="block truncate">{task.name}</span>
              <span className="block truncate text-xs text-zinc-600">{task.branch}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
