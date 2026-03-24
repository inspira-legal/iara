import { useState, useEffect } from "react";
import { ChevronLeft, Plus, Sparkles, Code, FolderOpen, GitFork } from "lucide-react";
import type { Project, Workspace, RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { useAppStore } from "~/stores/app";
import { useTerminalStore } from "~/stores/terminal";
import { useRegenerate } from "~/hooks/useRegenerate";
import { EnvEditor } from "./EnvEditor";
import { TerminalView } from "./TerminalView";
import { SessionList } from "./SessionList";
import { AddRepoDialog } from "./AddRepoDialog";
import { RegenerationBanner } from "./RegenerationBanner";
import { ConfirmDialog } from "./ConfirmDialog";
import { PromptPreview } from "./PromptPreview";
import { RepoCard } from "./RepoCard";
import { GitSyncButton } from "./GitSyncButton";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";
import { EmptyState } from "./ui/EmptyState";

const ROOT_WORKSPACE_SLUG = "main";

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

  const hasTerminal = terminalEntry.status !== "idle";

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          {hasTerminal && (
            <Button variant="ghost" size="icon" onClick={handleBack} title="Back to sessions">
              <ChevronLeft size={16} />
            </Button>
          )}
          <div>
            {workspace ? (
              <>
                <div className="text-xs text-zinc-500">{project.name}</div>
                <div className="text-sm font-medium text-zinc-100">{workspace.name}</div>
              </>
            ) : (
              <div className="text-sm font-medium text-zinc-100">{project.name}</div>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
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
        <DetailView
          project={project}
          workspace={workspace}
          repoInfo={repoInfo}
          hasActiveTerminal={hasTerminal}
          onRepoInfoChanged={updateRepoInfo}
          onLaunchSession={handleLaunchSession}
        />
      )}
    </div>
  );
}

function DetailView({
  project,
  workspace,
  repoInfo,
  hasActiveTerminal,
  onRepoInfoChanged,
  onLaunchSession,
}: {
  project: Project;
  workspace: Workspace;
  repoInfo: RepoInfo[];
  hasActiveTerminal: boolean;
  onRepoInfoChanged: (info: RepoInfo[]) => void;
  onLaunchSession: (resumeSessionId?: string, sessionCwd?: string) => void;
}) {
  const isProjectRoot = workspace.slug === ROOT_WORKSPACE_SLUG;
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<string | null>(null);

  const {
    isRegenerating,
    showEmptyBanner,
    messages,
    result,
    error,
    handleStartRegenerate,
    cancel,
  } = useRegenerate({
    entityId: workspace.id,
    filePath: `${project.slug}/CLAUDE.md`,
    regenerateFn: () =>
      transport.request("projects.analyze", {
        projectId: project.id,
        description: "",
      }),
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <RegenerationBanner
        isRegenerating={isRegenerating}
        showEmptyBanner={showEmptyBanner}
        error={error}
        messages={messages}
        fileName="CLAUDE.md"
        onGenerate={() => void handleStartRegenerate()}
        onCancel={cancel}
      />

      {!showEmptyBanner && !isRegenerating && (
        <div className="mb-6">
          <SectionHeader title="System Prompts" />
          <PromptPreview
            filePath={`${project.slug}/CLAUDE.md`}
            label="CLAUDE.md"
            refreshKey={result ? 1 : 0}
          />
        </div>
      )}

      <div className="mb-6">
        <SectionHeader
          title="Repos"
          action={
            !isRegenerating && !showEmptyBanner ? (
              <Button
                variant="action"
                size="sm"
                onClick={() => void handleStartRegenerate()}
                title="Regenerate CLAUDE.md"
              >
                <Sparkles size={12} />
                Regenerate CLAUDE.md
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-2">
          {repoInfo.length === 0 ? (
            <EmptyState
              icon={GitFork}
              message={
                isProjectRoot ? "No repos yet. Add a repo to get started." : "No repos configured."
              }
            />
          ) : isProjectRoot ? (
            repoInfo.map((repo) => (
              <RepoCard key={repo.name} repo={repo} onRemove={() => setRepoToDelete(repo.name)} />
            ))
          ) : (
            repoInfo.map((repo) => (
              <RepoCard
                key={repo.name}
                repo={repo}
                workspaceId={workspace.id}
                projectId={project.id}
                onRepoInfoUpdate={onRepoInfoChanged}
              />
            ))
          )}
        </div>

        {isProjectRoot && (
          <Button variant="dashed" size="sm" className="mt-3" onClick={() => setShowAddRepo(true)}>
            <Plus size={14} />
            Add Repo
          </Button>
        )}
      </div>

      <div className="mb-6">
        <EnvEditor
          workspaceId={workspace ? workspace.id : `${project.id}/default`}
          repos={repoInfo.map((r) => r.name)}
          {...(!isProjectRoot ? { hasActiveTerminal } : {})}
        />
      </div>

      <div>
        {workspace ? (
          <SessionList workspaceId={workspace.id} onLaunch={onLaunchSession} />
        ) : (
          <SessionList projectId={project.id} onLaunch={onLaunchSession} />
        )}
      </div>

      {isProjectRoot && (
        <>
          <AddRepoDialog
            open={showAddRepo}
            onClose={() => setShowAddRepo(false)}
            onAdd={async (input) => {
              await transport.request("repos.add", { projectId: project.id, ...input });
              const info = await transport.request("repos.getInfo", { projectId: project.id });
              onRepoInfoChanged(info);
            }}
          />

          <ConfirmDialog
            open={repoToDelete !== null}
            title="Remove Repo"
            description={`Remove "${repoToDelete}" from this project?`}
            details={
              <div className="mt-2 text-xs text-zinc-500">
                <p>
                  The repo directory in default/ will be deleted. Worktrees in active workspaces
                  will be removed.
                </p>
              </div>
            }
            confirmText="Remove Repo"
            confirmVariant="danger"
            onConfirm={async () => {
              setRepoToDelete(null);
              const info = await transport.request("repos.getInfo", { projectId: project.id });
              onRepoInfoChanged(info);
            }}
            onCancel={() => setRepoToDelete(null)}
          />
        </>
      )}
    </div>
  );
}
