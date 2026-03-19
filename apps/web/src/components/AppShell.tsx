import { useMemo, useCallback, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MainPanel } from "./MainPanel";
import { useKeyboardShortcuts } from "~/hooks/useKeyboardShortcuts";
import { useTaskStore } from "~/stores/tasks";
import { useProjectStore } from "~/stores/projects";
import { useSidebarStore } from "~/stores/sidebar";
import { isElectron } from "~/env";

type NavigableItem =
  | { type: "root"; projectId: string }
  | { type: "task"; projectId: string; taskId: string };

export function AppShell({ children }: { children: ReactNode }) {
  const { getTasksForProject, selectTask, tasksByProject } = useTaskStore();
  const { projects, selectProject } = useProjectStore();
  const { expandedProjectIds, projectOrder } = useSidebarStore();

  // Build flat list of navigable items from expanded projects (same order as sidebar)
  const navigableItems = useMemo(() => {
    const sorted =
      projectOrder.length > 0
        ? [...projects].toSorted((a, b) => {
            const orderMap = new Map(projectOrder.map((id, i) => [id, i]));
            const ai = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
            const bi = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
            return ai - bi;
          })
        : projects;

    const items: NavigableItem[] = [];
    for (const project of sorted) {
      if (!expandedProjectIds.has(project.id)) continue;
      items.push({ type: "root", projectId: project.id });
      const tasks = getTasksForProject(project.id);
      for (const task of tasks) {
        items.push({ type: "task", projectId: project.id, taskId: task.id });
      }
    }
    return items;
  }, [projects, projectOrder, expandedProjectIds, getTasksForProject, tasksByProject]);

  const selectByIndex = useCallback(
    (index: number) => {
      // Alt+1 = first item, Alt+0 = 10th item
      const idx = index === 0 ? 9 : index - 1;
      const item = navigableItems[idx];
      if (!item) return;
      selectProject(item.projectId);
      selectTask(item.type === "task" ? item.taskId : null);
    },
    [navigableItems, selectProject, selectTask],
  );

  const shortcuts = useMemo(
    () => ({
      "mod+b": () => {
        if (isElectron && window.desktopBridge) {
          void window.desktopBridge.browserToggle();
        }
      },
      "alt+1": () => selectByIndex(1),
      "alt+2": () => selectByIndex(2),
      "alt+3": () => selectByIndex(3),
      "alt+4": () => selectByIndex(4),
      "alt+5": () => selectByIndex(5),
      "alt+6": () => selectByIndex(6),
      "alt+7": () => selectByIndex(7),
      "alt+8": () => selectByIndex(8),
      "alt+9": () => selectByIndex(9),
      "alt+0": () => selectByIndex(0),
      "mod+1": () => selectByIndex(1),
      "mod+2": () => selectByIndex(2),
      "mod+3": () => selectByIndex(3),
      "mod+4": () => selectByIndex(4),
      "mod+5": () => selectByIndex(5),
      "mod+6": () => selectByIndex(6),
      "mod+7": () => selectByIndex(7),
      "mod+8": () => selectByIndex(8),
      "mod+9": () => selectByIndex(9),
    }),
    [selectByIndex],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar />
      <MainPanel>{children}</MainPanel>
    </div>
  );
}
