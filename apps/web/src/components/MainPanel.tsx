import type { ReactNode } from "react";
import { BottomPanel } from "./BottomPanel";

export function MainPanel({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">{children}</div>
      <BottomPanel />
    </main>
  );
}
