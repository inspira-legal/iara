import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useProjectStore } from "~/stores/projects";
import { ProjectList } from "./ProjectList";
import { TaskList } from "./TaskList";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { DevServerPanel } from "./DevServerPanel";
import { BrowserToggle } from "./BrowserToggle";

export function Sidebar() {
  const { projects, selectedProjectId, loading, loadProjects, selectProject, deleteProject } =
    useProjectStore();
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <>
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex h-12 items-center justify-between px-4">
          <h1 className="text-sm font-semibold tracking-wide text-zinc-300">iara</h1>
          <BrowserToggle />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <SidebarSection
            title="Projects"
            action={{ icon: Plus, onClick: () => setShowCreateProject(true) }}
          >
            {loading ? (
              <p className="px-2 py-4 text-center text-xs text-zinc-600">Loading...</p>
            ) : projects.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-zinc-600">No projects yet</p>
            ) : (
              <ProjectList
                projects={projects}
                selectedId={selectedProjectId}
                onSelect={selectProject}
                onDelete={(id) => void deleteProject(id)}
              />
            )}
          </SidebarSection>

          {selectedProjectId && (
            <SidebarSection
              title="Tasks"
              action={{ icon: Plus, onClick: () => setShowCreateTask(true) }}
            >
              <TaskList projectId={selectedProjectId} />
            </SidebarSection>
          )}

          <div className="mt-auto border-t border-zinc-800">
            <DevServerPanel />
          </div>
        </div>
      </aside>

      <CreateProjectDialog open={showCreateProject} onClose={() => setShowCreateProject(false)} />
      {selectedProjectId && (
        <CreateTaskDialog
          open={showCreateTask}
          onClose={() => setShowCreateTask(false)}
          projectId={selectedProjectId}
        />
      )}
    </>
  );
}

function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: { icon: React.ComponentType<{ size?: number }>; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <action.icon size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2">{children}</div>
    </div>
  );
}
