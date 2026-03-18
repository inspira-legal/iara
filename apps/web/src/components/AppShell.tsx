import { useMemo, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MainPanel } from "./MainPanel";
import { useKeyboardShortcuts } from "~/hooks/useKeyboardShortcuts";
import { isElectron } from "~/env";

export function AppShell({ children }: { children: ReactNode }) {
  const shortcuts = useMemo(
    () => ({
      "mod+b": () => {
        if (isElectron && window.desktopBridge) {
          void window.desktopBridge.browserToggle();
        }
      },
    }),
    [],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar />
      <MainPanel>{children}</MainPanel>
    </div>
  );
}
