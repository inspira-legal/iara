import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "~/stores/app";
import { TaskWorkspace } from "~/components/TaskWorkspace";
import { DefaultWorkspace } from "~/components/DefaultWorkspace";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const workspace = useAppStore((s) => s.selectedWorkspace());
  const project = useAppStore((s) => s.selectedProject());

  if (workspace && workspace.type === "task" && project) {
    return <TaskWorkspace key={workspace.id} project={project} task={workspace} />;
  }

  if (project) {
    return <DefaultWorkspace project={project} />;
  }

  return (
    <div className="flex h-full items-center justify-center text-zinc-500">
      <p>Select a project to get started</p>
    </div>
  );
}
