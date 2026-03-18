import { createFileRoute } from "@tanstack/react-router";
import { useProjectStore } from "~/stores/projects";
import { useTaskStore } from "~/stores/tasks";
import { TaskWorkspace } from "~/components/TaskWorkspace";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { projects, selectedProjectId } = useProjectStore();
  const { tasks, selectedTaskId } = useTaskStore();
  const { completeTask, deleteTask } = useTaskStore();

  const project = projects.find((p) => p.id === selectedProjectId);
  const task = tasks.find((t) => t.id === selectedTaskId);

  if (!project || !task) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p>{project ? "Select a task to get started" : "Select a project to get started"}</p>
      </div>
    );
  }

  return (
    <TaskWorkspace
      project={project}
      task={task}
      onLaunchClaude={() => {
        // T8: Claude launcher — will be implemented
      }}
      onCompleteTask={() => void completeTask(task.id)}
      onDeleteTask={() => void deleteTask(task.id)}
    />
  );
}
