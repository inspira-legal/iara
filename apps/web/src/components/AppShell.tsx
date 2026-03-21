import { useMemo, useCallback, type ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { Sidebar } from "./Sidebar";
import { MainPanel } from "./MainPanel";
import { useKeyboardShortcuts } from "~/hooks/useKeyboardShortcuts";
import { useAppStore } from "~/stores/app";
import { useSidebarStore } from "~/stores/sidebar";
import { isElectron } from "~/env";

type NavigableItem =
  | { type: "root"; projectId: string }
  | { type: "task"; projectId: string; taskId: string };

export function AppShell({ children }: { children: ReactNode }) {
  const projects = useAppStore((s) => s.projects);
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const selectProject = useAppStore((s) => s.selectProject);
  const selectWorkspace = useAppStore((s) => s.selectWorkspace);
  const getWorkspacesForProject = useAppStore((s) => s.getWorkspacesForProject);
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
      const workspaces = getWorkspacesForProject(project.id);
      for (const ws of workspaces) {
        items.push({ type: "task", projectId: project.id, taskId: ws.id });
      }
    }
    return items;
  }, [projects, projectOrder, expandedProjectIds, getWorkspacesForProject, selectedWorkspaceId]);

  const selectByIndex = useCallback(
    (index: number) => {
      // Alt+1 = first item, Alt+0 = 10th item
      const idx = index === 0 ? 9 : index - 1;
      const item = navigableItems[idx];
      if (!item) return;
      selectProject(item.projectId);
      selectWorkspace(item.type === "task" ? item.taskId : null);
    },
    [navigableItems, selectProject, selectWorkspace],
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

  const mainLayout = useDefaultLayout({ id: "iara:main-layout:v3", storage: localStorage });

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Group
        orientation="horizontal"
        defaultLayout={mainLayout.defaultLayout}
        onLayoutChanged={mainLayout.onLayoutChanged}
      >
        <Panel
          id="sidebar"
          defaultSize="280px"
          minSize="200px"
          maxSize="480px"
          collapsible
          collapsedSize={0}
        >
          <Sidebar />
        </Panel>
        <Separator className="relative z-10 -mx-1.5 w-3 bg-transparent outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-blue-500/50 data-[resize-handle-active]:after:bg-blue-500/70" />
        <Panel id="main" minSize="40%">
          <MainPanel>{children}</MainPanel>
        </Panel>
      </Group>
    </div>
  );
}
