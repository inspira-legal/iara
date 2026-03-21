import { type ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { BottomPanel } from "./BottomPanel";
import { useScriptsStore } from "~/stores/scripts";
import { useWorkspace } from "~/lib/workspace";

export function MainPanel({ children }: { children: ReactNode }) {
  const bottomPanelRef = usePanelRef();
  const { setCollapsed } = useScriptsStore();
  const workspace = useWorkspace();

  const contentLayout = useDefaultLayout({ id: "iara:content-layout:v3", storage: localStorage });

  const handleBottomPanelResize = () => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    const isCollapsed = panel.isCollapsed();
    if (isCollapsed !== useScriptsStore.getState().collapsed) {
      setCollapsed(isCollapsed);
    }
  };

  return (
    <main className="flex h-full flex-col overflow-hidden">
      <Group
        orientation="vertical"
        defaultLayout={contentLayout.defaultLayout}
        onLayoutChanged={contentLayout.onLayoutChanged}
      >
        <Panel id="content" defaultSize="70%" minSize="30%">
          <div className="h-full overflow-hidden">{children}</div>
        </Panel>
        {workspace && (
          <>
            <Separator className="relative z-10 -my-1.5 h-3 bg-transparent outline-none after:absolute after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2 after:bg-transparent after:transition-colors hover:after:bg-blue-500/50 data-[resize-handle-active]:after:bg-blue-500/70" />
            <Panel
              id="bottom"
              panelRef={bottomPanelRef}
              defaultSize="240px"
              minSize="120px"
              maxSize="600px"
              collapsible
              collapsedSize="32px"
              onResize={handleBottomPanelResize}
            >
              <BottomPanel panelRef={bottomPanelRef} />
            </Panel>
          </>
        )}
      </Group>
    </main>
  );
}
