import { useState, useEffect } from "react";
import { AlertTriangle, ChevronLeft, Code, FolderOpen, Settings2 } from "lucide-react";
import type { Project, Workspace, RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { useAppStore } from "~/stores/app";
import { useTerminalStore } from "~/stores/terminal";
import { usePanelsStore } from "~/stores/panels";
import { TerminalView } from "./TerminalView";
import { SessionList } from "./SessionList";
import { ClaudeMdView } from "./ClaudeMdView";
import { GitSyncButton } from "./GitSyncButton";
import { Button } from "./ui/Button";

const FETCH_INTERVAL_MS = 5 * 60 * 1000;

interface WorkspaceViewProps {
  project: Project;
  workspace: Workspace;
}

export function WorkspaceView({ project, workspace }: WorkspaceViewProps) {
  const cacheKey = workspace.id;
  const serverWorkspaceId = workspace.id;
  const terminalEntry = useTerminalStore((s) => s.getEntry(serverWorkspaceId));
  const resetToSessions = useTerminalStore((s) => s.resetToSessions);
  const createTerminal = useTerminalStore((s) => s.create);
  const repoInfo = useAppStore((s) => s.getRepoInfo(cacheKey));
  const refreshRepoInfo = useAppStore((s) => s.refreshRepoInfo);
  const toggleRightPanel = usePanelsStore((s) => s.toggleRightPanel);
  const rightPanelOpen = usePanelsStore((s) => s.rightPanelOpen);

  const hasTerminal = terminalEntry.status !== "idle";
  const hasRepos = repoInfo.length > 0;

  const [pendingResumeSessionId, setPendingResumeSessionId] = useState<string | undefined>();

  // Background git fetch on interval
  useEffect(() => {
    const doFetch = () => {
      void transport
        .request("repos.fetch", {
          projectId: project.id,
          workspaceId: workspace.id,
        })
        .catch(() => {});
    };

    doFetch();
    const id = setInterval(doFetch, FETCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [project.id, workspace]);

  // Initial repo info load (subsequent updates come via repos:changed push)
  useEffect(() => {
    void refreshRepoInfo(project.id, cacheKey, workspace.id);
  }, [project.id, cacheKey, workspace.id, refreshRepoInfo]);

  const handleLaunchSession = (resumeSessionId?: string, sessionCwd?: string) => {
    setPendingResumeSessionId(resumeSessionId);
    void createTerminal(serverWorkspaceId, resumeSessionId, sessionCwd);
  };

  const handleBack = () => {
    resetToSessions(serverWorkspaceId);
    setPendingResumeSessionId(undefined);
  };

  const updateRepoInfo = (info: RepoInfo[]) => {
    useAppStore.setState((s) => ({
      repoInfo: { ...s.repoInfo, [cacheKey]: info },
    }));
  };

  const claudeAvailable = useAppStore((s) => s.capabilities.claude);

  return (
    <div className="flex h-full flex-col">
      {!claudeAvailable && <ClaudeUnavailableBanner />}
      <div className="flex h-12 items-center border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          {hasTerminal && (
            <Button variant="ghost" size="icon" onClick={handleBack} title="Back to sessions">
              <ChevronLeft size={16} />
            </Button>
          )}
          <div>
            <div className="text-xs text-zinc-500">{project.name}</div>
            <div className="text-sm font-medium text-zinc-100">{workspace.name}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {hasRepos && (
            <Button
              variant={rightPanelOpen ? "ghost-active" : "ghost"}
              size="icon-md"
              onClick={toggleRightPanel}
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
              void transport.request("files.openInEditor", { workspaceId: serverWorkspaceId })
            }
            title="Open in editor"
          >
            <Code size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() =>
              void transport.request("files.openInExplorer", { workspaceId: serverWorkspaceId })
            }
            title="Open in file explorer"
          >
            <FolderOpen size={14} />
          </Button>
        </div>
      </div>

      {hasTerminal ? (
        <TerminalView
          workspaceId={serverWorkspaceId}
          {...(pendingResumeSessionId ? { resumeSessionId: pendingResumeSessionId } : {})}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8">
              <ClaudeMdView
                filePath={`${project.slug}/CLAUDE.md`}
                onEditProject={() => usePanelsStore.getState().setEditingProjectId(project.id)}
              />
            </div>

            <div>
              <SessionList workspaceId={workspace.id} onLaunch={handleLaunchSession} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClaudeUnavailableBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-center gap-2 border-b border-amber-800/30 bg-amber-950/40 px-4 py-2 text-sm text-amber-200">
      <AlertTriangle size={14} className="shrink-0 text-amber-400" />
      <span className="flex-1">
        Claude CLI not detected. Terminal sessions will use shell mode only.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-xs text-amber-400 hover:text-amber-300"
      >
        Dismiss
      </button>
    </div>
  );
}
