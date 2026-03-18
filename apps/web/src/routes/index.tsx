import { createFileRoute } from "@tanstack/react-router";
import { useProjectStore } from "~/stores/projects";
import { useTaskStore } from "~/stores/tasks";
import { TaskWorkspace } from "~/components/TaskWorkspace";
import { ensureNativeApi } from "~/nativeApi";
import { useToast } from "~/components/Toast";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { projects, selectedProjectId } = useProjectStore();
  const { tasks, selectedTaskId } = useTaskStore();
  const { completeTask, deleteTask } = useTaskStore();
  const { toast } = useToast();

  const project = projects.find((p) => p.id === selectedProjectId);
  const task = tasks.find((t) => t.id === selectedTaskId);

  if (!project || !task) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p>{project ? "Select a task to get started" : "Select a project to get started"}</p>
      </div>
    );
  }

  const handleLaunchClaude = async (resumeSessionId?: string | undefined) => {
    try {
      const api = ensureNativeApi();
      const input = resumeSessionId ? { taskId: task.id, resumeSessionId } : { taskId: task.id };
      const result = await api.launchClaude(input);
      toast(`Claude launched (session: ${result.sessionId.slice(0, 8)}...)`, "success");
    } catch (err) {
      toast(
        `Failed to launch Claude: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
  };

  const handleComplete = async () => {
    await completeTask(task.id);
    toast("Task completed", "success");
  };

  const handleDelete = async () => {
    await deleteTask(task.id);
    toast("Task deleted", "info");
  };

  return (
    <TaskWorkspace
      project={project}
      task={task}
      onLaunchClaude={(sid) => void handleLaunchClaude(sid)}
      onCompleteTask={() => void handleComplete()}
      onDeleteTask={() => void handleDelete()}
    />
  );
}
