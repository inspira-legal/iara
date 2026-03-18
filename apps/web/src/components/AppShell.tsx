import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MainPanel } from "./MainPanel";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar />
      <MainPanel>{children}</MainPanel>
    </div>
  );
}
