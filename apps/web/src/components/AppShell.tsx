import { useMemo, useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { Sidebar } from "./Sidebar";
import { MainPanel } from "./MainPanel";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { CommandPalette } from "./CommandPalette";
import { useKeyboardShortcuts } from "~/hooks/useKeyboardShortcuts";
import { useActiveSessionStore } from "~/stores/activeSession";
import { isElectron } from "~/env";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommand, setShowCommand] = useState(false);
  const sidebarPanelRef = usePanelRef();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const selectByIndex = useCallback(
    (index: number) => {
      // Alt+1 = first item, Alt+0 = 10th item
      const idx = index === 0 ? 9 : index - 1;
      const entries = [...useActiveSessionStore.getState().entries.values()];
      const entry = entries[idx];
      if (!entry) return;
      void navigate({ to: "/session/$id", params: { id: entry.id } });
    },
    [navigate],
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
      "mod+1": () => selectByIndex(1),
      "mod+2": () => selectByIndex(2),
      "mod+3": () => selectByIndex(3),
      "mod+4": () => selectByIndex(4),
      "mod+5": () => selectByIndex(5),
      "mod+6": () => selectByIndex(6),
      "mod+7": () => selectByIndex(7),
      "mod+8": () => selectByIndex(8),
      "mod+9": () => selectByIndex(9),
      "mod+p": () => setShowCommand((v) => !v),
      f1: () => setShowShortcuts((v) => !v),
    }),
    [selectByIndex],
  );

  useKeyboardShortcuts(shortcuts);

  const mainLayout = useDefaultLayout({ id: "iara:main-layout:v4", storage: localStorage });

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <CommandPalette open={showCommand} onClose={() => setShowCommand(false)} />
      <Group
        orientation="horizontal"
        defaultLayout={mainLayout.defaultLayout}
        onLayoutChanged={mainLayout.onLayoutChanged}
      >
        <Panel
          panelRef={sidebarPanelRef}
          id="sidebar"
          defaultSize="280px"
          minSize="220px"
          maxSize="480px"
          collapsible
          collapsedSize="48px"
          onResize={() => {
            setSidebarCollapsed(sidebarPanelRef.current?.isCollapsed() ?? false);
          }}
        >
          <Sidebar panelRef={sidebarPanelRef} panelCollapsed={sidebarCollapsed} />
        </Panel>
        <Separator className="relative z-10 -mx-1.5 w-3 bg-transparent outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-blue-500/50 data-[resize-handle-active]:after:bg-blue-500/70" />
        <Panel id="main" minSize="40%">
          <MainPanel>{children}</MainPanel>
        </Panel>
      </Group>
    </div>
  );
}
