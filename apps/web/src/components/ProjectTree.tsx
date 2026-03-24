import { useMemo, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, FolderOpen } from "lucide-react";
import type { Project } from "@iara/contracts";
import { ProjectNode } from "./ProjectNode";
import { useSidebarStore } from "~/stores/sidebar";
import { useAppStore } from "~/stores/app";

interface ProjectTreeProps {
  projects: Project[];
  onCreateWorkspace: (projectId: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => Promise<void>;
  onCreateFirstProject: () => void;
  onAddRepo?: (projectId: string) => void;
}

type TreeItem =
  | { type: "project"; id: string }
  | { type: "workspace"; id: string; projectId: string };

export function ProjectTree({
  projects,
  onCreateWorkspace,
  onDeleteProject,
  onRenameProject,
  onCreateFirstProject,
  onAddRepo,
}: ProjectTreeProps) {
  const {
    expandedProjectIds,
    projectOrder,
    toggleProject,
    expandProject,
    collapseProject,
    setProjectOrder,
  } = useSidebarStore();
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const selectWorkspace = useAppStore((s) => s.selectWorkspace);
  const getWorkspacesForProject = useAppStore((s) => s.getWorkspacesForProject);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId());
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort projects by persisted order, unordered ones go to the end
  const sortedProjects = useMemo(() => {
    if (projectOrder.length === 0) return projects;
    const orderMap = new Map(projectOrder.map((id, i) => [id, i]));
    return [...projects].toSorted((a, b) => {
      const ai = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [projects, projectOrder]);

  const projectIds = useMemo(() => sortedProjects.map((p) => p.id), [sortedProjects]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = projectIds.indexOf(active.id as string);
    const newIndex = projectIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...projectIds];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, active.id as string);
    setProjectOrder(newOrder);
  };

  // Build flat list of visible tree items for keyboard navigation
  const flatItems = useMemo(() => {
    const items: TreeItem[] = [];
    for (const project of sortedProjects) {
      items.push({ type: "project", id: project.id });
      if (expandedProjectIds.has(project.id)) {
        const workspaces = getWorkspacesForProject(project.id);
        for (const ws of workspaces) {
          items.push({ type: "workspace", id: ws.id, projectId: project.id });
        }
      }
    }
    return items;
  }, [sortedProjects, expandedProjectIds, getWorkspacesForProject]);

  // Find current focused item index
  const getCurrentIndex = useCallback(() => {
    if (selectedWorkspaceId) {
      return flatItems.findIndex(
        (item) => item.type === "workspace" && item.id === selectedWorkspaceId,
      );
    }
    if (selectedProjectId && !selectedWorkspaceId) {
      return flatItems.findIndex(
        (item) => item.type === "project" && item.id === selectedProjectId,
      );
    }
    return -1;
  }, [flatItems, selectedWorkspaceId, selectedProjectId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIdx = getCurrentIndex();

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIdx = Math.min(currentIdx + 1, flatItems.length - 1);
          const item = flatItems[nextIdx];
          if (item?.type === "workspace") {
            selectWorkspace(item.id);
          } else if (item?.type === "project") {
            selectWorkspace(null);
            expandProject(item.id);
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIdx = Math.max(currentIdx - 1, 0);
          const item = flatItems[prevIdx];
          if (item?.type === "workspace") {
            selectWorkspace(item.id);
          } else if (item?.type === "project") {
            selectWorkspace(null);
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const item = currentIdx >= 0 ? flatItems[currentIdx] : flatItems[0];
          if (item?.type === "project") expandProject(item.id);
          else if (item?.type === "workspace") expandProject(item.projectId);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const item = currentIdx >= 0 ? flatItems[currentIdx] : null;
          if (item?.type === "project") collapseProject(item.id);
          else if (item?.type === "workspace") collapseProject(item.projectId);
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          const item = currentIdx >= 0 ? flatItems[currentIdx] : null;
          if (item?.type === "project") toggleProject(item.id);
          else if (item?.type === "workspace") selectWorkspace(item.id);
          break;
        }
      }
    },
    [getCurrentIndex, flatItems, selectWorkspace, expandProject, collapseProject, toggleProject],
  );

  if (projects.length === 0) {
    return (
      <div className="mx-3 flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-700/60 px-4 py-8 text-center">
        <FolderOpen size={20} className="text-zinc-600" />
        <p className="text-xs text-zinc-500">No projects yet</p>
        <button
          type="button"
          onClick={onCreateFirstProject}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
        >
          Create your first project
        </button>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
        <div
          ref={containerRef}
          role="tree"
          aria-label="Project tree"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="flex flex-col gap-2 px-1 py-1 outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50"
        >
          {sortedProjects.map((project) => (
            <SortableProjectNode
              key={project.id}
              project={project}
              isExpanded={expandedProjectIds.has(project.id)}
              isSelected={selectedProjectId === project.id && !selectedWorkspaceId}
              onToggle={() => {
                if (expandedProjectIds.has(project.id)) {
                  if (selectedProjectId === project.id) {
                    selectWorkspace(null);
                  }
                }
                toggleProject(project.id);
              }}
              selectedWorkspaceId={selectedWorkspaceId}
              onSelectWorkspace={(id) => {
                selectWorkspace(id);
              }}
              onCreateWorkspace={() => onCreateWorkspace(project.id)}
              onDeleteProject={() => onDeleteProject(project.id)}
              onRenameProject={(newName) => onRenameProject(project.id, newName)}
              onAddRepo={onAddRepo ? () => onAddRepo(project.id) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableProjectNode({
  project,
  ...props
}: {
  project: Project;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string | null) => void;
  onCreateWorkspace: () => void;
  onDeleteProject: () => void;
  onRenameProject: (newName: string) => Promise<void>;
  onAddRepo?: (() => void) | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/project">
      <div className="flex items-start">
        <button
          type="button"
          aria-label={`Reorder ${project.name}`}
          className="mt-2 shrink-0 cursor-grab rounded p-0.5 text-zinc-700 opacity-0 transition-opacity group-hover/project:opacity-100 hover:text-zinc-500 active:cursor-grabbing focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} />
        </button>
        <div className="min-w-0 flex-1">
          <ProjectNode project={project} {...props} />
        </div>
      </div>
    </div>
  );
}
