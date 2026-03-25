import { useCallback, useEffect, useRef } from "react";
import { X, Settings2 } from "lucide-react";
import type { RepoInfo } from "@iara/contracts";
import { usePanelsStore } from "~/stores/panels";
import { useAppStore } from "~/stores/app";
import { EnvEditor } from "./EnvEditor";
import { Button } from "./ui/Button";

const EMPTY_REPO_INFO: RepoInfo[] = [];

export function RightPanel() {
  const open = usePanelsStore((s) => s.rightPanelOpen);
  const width = usePanelsStore((s) => s.rightPanelWidth);
  const setWidth = usePanelsStore((s) => s.setRightPanelWidth);
  const closePanel = usePanelsStore((s) => s.closeRightPanel);
  const editingProjectId = usePanelsStore((s) => s.editingProjectId);

  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const repoInfo = useAppStore((s) => {
    const wsId = s.selectedWorkspaceId;
    return wsId ? s.getRepoInfo(wsId) : EMPTY_REPO_INFO;
  });

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: width };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        // Dragging left edge — moving left increases width
        const delta = dragRef.current.startX - ev.clientX;
        setWidth(dragRef.current.startWidth + delta);
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width, setWidth],
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closePanel]);

  // Don't render when editing project or panel is closed
  if (!open || editingProjectId || !selectedWorkspaceId) return null;

  const repos = repoInfo.map((r) => r.name);
  if (repos.length === 0) return null;

  return (
    <div className="flex h-full shrink-0" style={{ width }}>
      {/* Resize handle */}
      <div
        className="group relative z-10 w-3 shrink-0 cursor-col-resize"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-800 transition-colors group-hover:bg-blue-500/50" />
      </div>

      {/* Panel content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Settings2 size={14} className="text-zinc-500" />
            Environment
          </div>
          <Button variant="ghost" size="icon" onClick={closePanel} title="Close panel">
            <X size={14} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <EnvEditor workspaceId={selectedWorkspaceId} repos={repos} />
        </div>
      </div>
    </div>
  );
}
