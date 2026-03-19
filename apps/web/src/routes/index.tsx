import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useProjectStore } from "~/stores/projects";
import { useTaskStore } from "~/stores/tasks";
import { TaskWorkspace } from "~/components/TaskWorkspace";
import { ProjectView } from "~/components/ProjectView";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { useToast } from "~/components/Toast";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { projects, selectedProjectId } = useProjectStore();
  const { tasks, selectedTaskId } = useTaskStore();
  const { completeTask, deleteTask } = useTaskStore();
  const { toast } = useToast();
  const [showDeleteTask, setShowDeleteTask] = useState(false);

  const project = projects.find((p) => p.id === selectedProjectId);
  const task = tasks.find((t) => t.id === selectedTaskId);

  if (!project && !task) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p>Select a project to get started</p>
      </div>
    );
  }

  if (!task && project) {
    return <ProjectView project={project} />;
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p>Select a project to get started</p>
      </div>
    );
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
    <>
      <TaskWorkspace
        key={task.id}
        project={project}
        task={task}
        onCompleteTask={() => void handleComplete()}
        onDeleteTask={() => setShowDeleteTask(true)}
      />

      <ConfirmDialog
        open={showDeleteTask}
        title="Delete Task"
        description={`Delete task "${task.name}"?`}
        details={
          <div className="mt-2 text-xs text-zinc-500">
            <p>Branch: {task.branch}</p>
            <p>Worktrees will be removed.</p>
          </div>
        }
        confirmText="Delete Task"
        confirmVariant="danger"
        onConfirm={() => {
          void handleDelete();
          setShowDeleteTask(false);
        }}
        onCancel={() => setShowDeleteTask(false)}
      />
    </>
  );
}
