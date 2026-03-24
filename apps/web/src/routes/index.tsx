import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "~/stores/app";
import { WorkspaceView } from "~/components/WorkspaceView";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const workspace = useAppStore((s) => s.selectedWorkspace());
  const project = useAppStore((s) => s.selectedProject());

  // Default to "main" workspace when only a project is selected
  const effectiveWorkspace =
    workspace ?? project?.workspaces.find((w) => w.slug === "main") ?? undefined;

  if (project && effectiveWorkspace) {
    return (
      <WorkspaceView key={effectiveWorkspace.id} project={project} workspace={effectiveWorkspace} />
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-zinc-500">
      <p>Select a project to get started</p>
    </div>
  );
}
