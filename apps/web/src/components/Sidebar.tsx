import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Settings } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useProjectStore } from "~/stores/projects";
import { useTaskStore } from "~/stores/tasks";
import { useDevServerStore } from "~/stores/devservers";
import { useSidebarStore } from "~/stores/sidebar";
import { ProjectTree } from "./ProjectTree";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { DevServerPanel } from "./DevServerPanel";
import { BrowserToggle } from "./BrowserToggle";
import { NotificationBell } from "./NotificationBell";
import { ConfirmDialog } from "./ConfirmDialog";
import { AddRepoDialog } from "./AddRepoDialog";
import { transport } from "~/lib/ws-transport";

export function Sidebar() {
  const navigate = useNavigate();
  const { projects, selectedProjectId, loading, loadProjects, updateProject, deleteProject } =
    useProjectStore();
  const { selectedTaskId } = useTaskStore();
  const { discoverCommands } = useDevServerStore();
  const { sidebarWidth, setSidebarWidth, hydrateFromStorage } = useSidebarStore();

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [createTaskProjectId, setCreateTaskProjectId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [addRepoProjectId, setAddRepoProjectId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = sidebarWidth;
    },
    [sidebarWidth],
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      setSidebarWidth(startWidthRef.current + delta);
    };

    const onMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

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
      <aside
        className="relative flex shrink-0 flex-col border-r border-zinc-800 bg-zinc-900"
        style={{ width: sidebarWidth }}
      >
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
            <NotificationBell />
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
            onAddRepo={(projectId) => setAddRepoProjectId(projectId)}
          />
        </div>

        {/* Dev servers — sticky bottom */}
        <div className="border-t border-zinc-800">
          <DevServerPanel />
        </div>

        {/* Settings button — footer */}
        <div className="border-t border-zinc-800 px-3 py-2">
          <button
            type="button"
            onClick={() => void navigate({ to: "/settings" })}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Settings size={14} />
            Configurações
          </button>
        </div>
        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onResizeStart}
          onDoubleClick={() => setSidebarWidth(256)}
          className={`absolute top-0 right-0 bottom-0 w-1 cursor-col-resize transition-colors hover:bg-blue-500/50 ${isResizing ? "bg-blue-500/50" : ""}`}
        />
      </aside>

      {/* Prevent text selection and pointer events while resizing */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      {/* Dialogs */}
      <CreateProjectDialog open={showCreateProject} onClose={() => setShowCreateProject(false)} />

      {createTaskProjectId && (
        <CreateTaskDialog
          open={createTaskProjectId !== null}
          onClose={() => setCreateTaskProjectId(null)}
          projectId={createTaskProjectId}
          project={projects.find((p) => p.id === createTaskProjectId)}
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
