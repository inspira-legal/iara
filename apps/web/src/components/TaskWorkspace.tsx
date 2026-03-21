import { useState, useEffect } from "react";
import { GitBranch, ChevronLeft, Code, FolderOpen, Sparkles } from "lucide-react";
import type { Workspace, Project } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { useAppStore } from "~/stores/app";
import { useTerminalStore } from "~/stores/terminal";
import { useRegenerate } from "~/hooks/useRegenerate";
import { RegenerationBanner } from "./RegenerationBanner";
import { PromptPreview } from "./PromptPreview";
import { EnvEditor } from "./EnvEditor";
import { TerminalView } from "./TerminalView";
import { SessionList } from "./SessionList";
import { RepoCard, RepoSkeleton } from "./RepoCard";
import { GitSyncButton } from "./GitSyncButton";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";

const FETCH_INTERVAL_MS = 5 * 60 * 1000;

interface TaskWorkspaceProps {
  project: Project;
  task: Workspace;
}

export function TaskWorkspace({ project, task }: TaskWorkspaceProps) {
  const terminalEntry = useTerminalStore((s) => s.getEntry(task.id));
  const resetToSessions = useTerminalStore((s) => s.resetToSessions);
  const createTerminal = useTerminalStore((s) => s.create);
  const repoInfo = useAppStore((s) => s.getRepoInfo(task.id));
  const refreshRepoInfo = useAppStore((s) => s.refreshRepoInfo);

  const hasTerminal = terminalEntry.status !== "idle";

  const [pendingResumeSessionId, setPendingResumeSessionId] = useState<string | undefined>();

  // Background git fetch on interval
  useEffect(() => {
    const doFetch = () => {
      void transport
        .request("repos.fetch", { projectId: project.id, workspaceId: task.id })
        .catch(() => {});
    };

    doFetch();
    const id = setInterval(doFetch, FETCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [project.id, task.id]);

  // SWR: refresh repo info from server (store already has cached data)
  useEffect(() => {
    void refreshRepoInfo(project.id, task.id);
  }, [project.id, task.id, refreshRepoInfo]);

  const handleLaunchSession = (resumeSessionId?: string, sessionCwd?: string) => {
    setPendingResumeSessionId(resumeSessionId);
    void createTerminal(task.id, resumeSessionId, sessionCwd);
  };

  const handleBack = () => {
    resetToSessions(task.id);
    setPendingResumeSessionId(undefined);
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
            <div className="text-xs text-zinc-500">{project.name}</div>
            <div className="text-sm font-medium text-zinc-100">{task.name}</div>
          </div>
          {task.branch && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <GitBranch size={12} />
              <code className="rounded bg-zinc-800 px-1 py-0.5">{task.branch}</code>
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <GitSyncButton
            projectId={project.id}
            workspaceId={task.id}
            repoInfo={repoInfo}
            onSynced={(info) => {
              useAppStore.setState((s) => ({
                repoInfo: { ...s.repoInfo, [task.id]: info },
              }));
            }}
          />
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() =>
              void transport.request("files.openInEditor", {
                workspaceId: task.id,
              })
            }
            title="Open in editor"
          >
            <Code size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() =>
              void transport.request("files.openInExplorer", {
                workspaceId: task.id,
              })
            }
            title="Open in file explorer"
          >
            <FolderOpen size={14} />
          </Button>
        </div>
      </div>

      {hasTerminal ? (
        <TerminalView
          taskId={task.id}
          {...(pendingResumeSessionId ? { resumeSessionId: pendingResumeSessionId } : {})}
        />
      ) : (
        <TaskDetailView
          project={project}
          task={task}
          repoInfo={repoInfo}
          hasActiveTerminal={hasTerminal}
          onLaunchSession={handleLaunchSession}
        />
      )}
    </div>
  );
}

function TaskDetailView({
  project,
  task,
  repoInfo,
  hasActiveTerminal,
  onLaunchSession,
}: {
  project: Project;
  task: Workspace;
  repoInfo: import("@iara/contracts").RepoInfo[];
  hasActiveTerminal: boolean;
  onLaunchSession: (resumeSessionId?: string, sessionCwd?: string) => void;
}) {
  const {
    isRegenerating,
    showEmptyBanner,
    messages,
    result,
    error,
    handleStartRegenerate,
    cancel,
  } = useRegenerate({
    entityId: task.id,
    filePath: `${project.slug}/${task.slug}/TASK.md`,
    regenerateFn: () => transport.request("workspaces.regenerate", { workspaceId: task.id }),
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <RegenerationBanner
        isRegenerating={isRegenerating}
        showEmptyBanner={showEmptyBanner}
        error={error}
        messages={messages}
        fileName="TASK.md"
        onGenerate={() => void handleStartRegenerate()}
        onCancel={cancel}
      />

      {task.description && (
        <div className="mb-6">
          <p className="text-sm text-zinc-400">{task.description}</p>
        </div>
      )}

      <div className="mb-6">
        <SectionHeader title="System Prompts" />
        <div className="space-y-1">
          <PromptPreview filePath={`${project.slug}/PROJECT.md`} label="PROJECT.md" />
          {!showEmptyBanner && !isRegenerating && (
            <PromptPreview
              filePath={`${project.slug}/${task.slug}/TASK.md`}
              label="TASK.md"
              refreshKey={result ? 1 : 0}
            />
          )}
        </div>
      </div>

      <div className="mb-6">
        <SectionHeader
          title="Repos"
          action={
            !isRegenerating && !showEmptyBanner ? (
              <Button
                variant="action"
                size="sm"
                onClick={() => void handleStartRegenerate()}
                title="Regenerate TASK.md"
              >
                <Sparkles size={12} />
                Regenerate TASK.md
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-2">
          {repoInfo.length === 0
            ? Array.from({ length: 1 }, (_, i) => <RepoSkeleton key={i} />)
            : repoInfo.map((repo) => <RepoCard key={repo.name} repo={repo} taskId={task.id} />)}
        </div>
      </div>

      <div className="mb-6">
        <EnvEditor
          workspaceId={task.id}
          repos={repoInfo.map((r) => r.name)}
          hasActiveTerminal={hasActiveTerminal}
        />
      </div>

      <div>
        <SessionList taskId={task.id} onLaunch={onLaunchSession} />
      </div>
    </div>
  );
}
