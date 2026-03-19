import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useProjectStore } from "~/stores/projects";
import { useTaskStore } from "~/stores/tasks";
import { useDevServerStore } from "~/stores/devservers";
import { useSidebarStore } from "~/stores/sidebar";
import { ProjectTree } from "./ProjectTree";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { DevServerPanel } from "./DevServerPanel";
import { BrowserToggle } from "./BrowserToggle";
import { ConfirmDialog } from "./ConfirmDialog";

export function Sidebar() {
  const { projects, selectedProjectId, loading, loadProjects, updateProject, deleteProject } =
    useProjectStore();
  const { selectedTaskId } = useTaskStore();
  const { discoverCommands } = useDevServerStore();
  const { hydrateFromStorage } = useSidebarStore();

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [createTaskProjectId, setCreateTaskProjectId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  // Hydrate sidebar state from localStorage on mount
  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // Discover dev commands when task changes
  useEffect(() => {
    if (selectedProjectId && selectedTaskId) {
      const project = projects.find((p) => p.id === selectedProjectId);
      if (project) {
        for (const repo of project.repoSources) {
          void discoverCommands(repo);
        }
      }
    }
  }, [selectedProjectId, selectedTaskId, projects, discoverCommands]);

  const deleteTargetProject = deleteProjectId
    ? projects.find((p) => p.id === deleteProjectId)
    : null;

  return (
    <>
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        {/* Header */}
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-wide text-zinc-300">iara</h1>
            {loading && <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowCreateProject(true)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              title="New Project"
            >
              <Plus size={14} />
            </button>
            <BrowserToggle />
          </div>
        </div>

        {/* Project tree — scrollable */}
        <div className="flex-1 overflow-y-auto">
          <ProjectTree
            projects={projects}
            onCreateTask={(projectId) => setCreateTaskProjectId(projectId)}
            onDeleteProject={(id) => setDeleteProjectId(id)}
            onRenameProject={async (id, newName) => {
              await updateProject(id, { name: newName });
            }}
            onCreateFirstProject={() => setShowCreateProject(true)}
          />
        </div>

        {/* Dev servers — sticky bottom */}
        <div className="border-t border-zinc-800">
          <DevServerPanel />
        </div>
      </aside>

      {/* Dialogs */}
      <CreateProjectDialog open={showCreateProject} onClose={() => setShowCreateProject(false)} />

      {createTaskProjectId && (
        <CreateTaskDialog
          open={createTaskProjectId !== null}
          onClose={() => setCreateTaskProjectId(null)}
          projectId={createTaskProjectId}
        />
      )}

      <ConfirmDialog
        open={deleteProjectId !== null}
        title="Delete Project"
        description={`Delete "${deleteTargetProject?.name ?? ""}"? This will remove all repos and worktrees.`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteProjectId) {
            void deleteProject(deleteProjectId);
            setDeleteProjectId(null);
          }
        }}
        onCancel={() => setDeleteProjectId(null)}
      />
    </>
  );
}
