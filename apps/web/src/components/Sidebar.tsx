import { useEffect, useState } from "react";
import { Plus, Settings } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAppStore } from "~/stores/app";
import { useSidebarStore } from "~/stores/sidebar";
import { ProjectTree } from "./ProjectTree";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { AddRepoDialog } from "./AddRepoDialog";
import { transport } from "~/lib/ws-transport";

export function Sidebar() {
  const navigate = useNavigate();
  const { projects, updateProject, deleteProject } = useAppStore();
  const loading = useAppStore((s) => !s.initialized);
  const hydrateFromStorage = useSidebarStore((s) => s.hydrateFromStorage);

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [createWorkspaceProjectId, setCreateWorkspaceProjectId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [addRepoProjectId, setAddRepoProjectId] = useState<string | null>(null);

  // Hydrate sidebar state from localStorage on mount (expandedProjectIds, projectOrder)
  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  const deleteTargetProject = deleteProjectId
    ? projects.find((p) => p.id === deleteProjectId)
    : null;

  return (
    <>
      <aside className="flex h-full flex-col bg-zinc-900">
        {/* Header */}
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-wide text-zinc-100">iara</h1>
            {loading && <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowCreateProject(true)}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              aria-label="New Project"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => void navigate({ to: "/settings" })}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              aria-label="Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* Project tree — scrollable */}
        <div className="flex-1 overflow-y-auto">
          <ProjectTree
            projects={projects}
            onCreateWorkspace={(projectId) => setCreateWorkspaceProjectId(projectId)}
            onDeleteProject={(id) => setDeleteProjectId(id)}
            onRenameProject={async (id, newName) => {
              await updateProject(id, { name: newName });
            }}
            onCreateFirstProject={() => setShowCreateProject(true)}
            onAddRepo={(projectId) => setAddRepoProjectId(projectId)}
          />
        </div>
      </aside>

      {/* Dialogs */}
      <CreateProjectDialog open={showCreateProject} onClose={() => setShowCreateProject(false)} />

      {createWorkspaceProjectId && (
        <CreateWorkspaceDialog
          open={createWorkspaceProjectId !== null}
          onClose={() => setCreateWorkspaceProjectId(null)}
          projectId={createWorkspaceProjectId}
        />
      )}

      {addRepoProjectId && (
        <AddRepoDialog
          open={addRepoProjectId !== null}
          onClose={() => setAddRepoProjectId(null)}
          onAdd={async (input) => {
            await transport.request("repos.add", { projectId: addRepoProjectId, ...input });
          }}
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
