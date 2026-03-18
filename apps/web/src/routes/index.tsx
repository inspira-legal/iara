import { createFileRoute } from "@tanstack/react-router";
import { useProjectStore } from "~/stores/projects";
import { useTaskStore } from "~/stores/tasks";
import { TaskWorkspace } from "~/components/TaskWorkspace";
import { ProjectView } from "~/components/ProjectView";
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

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p>Select a project to get started</p>
      </div>
    );
  }

  if (!task) {
    return <ProjectView project={project} />;
  }

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
      onCompleteTask={() => void handleComplete()}
      onDeleteTask={() => void handleDelete()}
    />
  );
}
