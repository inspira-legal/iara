import { Code, FolderOpen, Settings2 } from "lucide-react";
import type { Project, Workspace, RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { usePanelsStore } from "~/stores/panels";
import { useAppStore } from "~/stores/app";
import { GitSyncButton } from "./GitSyncButton";
import { Button } from "./ui/Button";

interface WorkspaceHeaderProps {
  project: Project;
  workspace: Workspace;
  repoInfo: RepoInfo[];
  sessionTitle?: string | null | undefined;
}

export function WorkspaceHeader({
  project,
  workspace,
  repoInfo,
  sessionTitle,
}: WorkspaceHeaderProps) {
  const toggleRightPanel = usePanelsStore((s) => s.toggleRightPanel);
  const rightPanelOpen = usePanelsStore((s) => s.rightPanelOpen);
  const cacheKey = workspace.id;
  const hasRepos = repoInfo.length > 0;

  const updateRepoInfo = (info: RepoInfo[]) => {
    useAppStore.setState((s) => ({
      repoInfo: { ...s.repoInfo, [cacheKey]: info },
    }));
  };

  return (
    <div className="flex h-12 items-center border-b border-zinc-800 px-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">
            {sessionTitle || "New session"}
          </div>
          <div className="truncate text-xs text-zinc-500">
            {project.name} / {workspace.name}
          </div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {hasRepos && (
          <Button
            variant={rightPanelOpen ? "ghost-active" : "ghost"}
            size="icon-md"
            onClick={toggleRightPanel}
            aria-label="Environment variables"
            title="Environment variables"
          >
            <Settings2 size={14} />
          </Button>
        )}
        <GitSyncButton
          projectId={project.id}
          workspaceId={workspace.id}
          repoInfo={repoInfo}
          onSynced={updateRepoInfo}
        />
        <Button
          variant="ghost"
          size="icon-md"
          onClick={() =>
            void transport.request("files.openInEditor", { workspaceId: workspace.id })
          }
          aria-label="Open in editor"
          title="Open in editor"
        >
          <Code size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-md"
          onClick={() =>
            void transport.request("files.openInExplorer", { workspaceId: workspace.id })
          }
          aria-label="Open in file explorer"
          title="Open in file explorer"
        >
          <FolderOpen size={14} />
        </Button>
      </div>
    </div>
  );
}
