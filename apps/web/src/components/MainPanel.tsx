import type { ReactNode } from "react";

export function MainPanel({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col overflow-hidden">{children}</main>;
}
