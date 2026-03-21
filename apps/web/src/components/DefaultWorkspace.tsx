import { useState, useEffect } from "react";
import { ChevronLeft, Plus, Sparkles, Code, FolderOpen } from "lucide-react";
import type { Project, RepoInfo } from "@iara/contracts";
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
import { RepoCard, RepoSkeleton } from "./RepoCard";
import { GitSyncButton } from "./GitSyncButton";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";
import { EmptyState } from "./ui/EmptyState";

const FETCH_INTERVAL_MS = 5 * 60 * 1000;

interface DefaultWorkspaceProps {
  project: Project;
}

export function DefaultWorkspace({ project }: DefaultWorkspaceProps) {
  const defaultKey = `${project.id}/default`;
  const terminalEntry = useTerminalStore((s) => s.getEntry(defaultKey));
  const resetToSessions = useTerminalStore((s) => s.resetToSessions);
  const createTerminal = useTerminalStore((s) => s.create);
  const [repoInfo, setRepoInfo] = useState<RepoInfo[]>([]);
  const [repoLoading, setRepoLoading] = useState(true);

  const hasTerminal = terminalEntry.status !== "idle";

  const [pendingResumeSessionId, setPendingResumeSessionId] = useState<string | undefined>();

  useEffect(() => {
    const doFetch = () => {
      void transport.request("repos.fetch", { projectId: project.id }).catch(() => {});
    };

    doFetch();
    const id = setInterval(doFetch, FETCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    setRepoLoading(true);

    transport
      .request("repos.getInfo", { projectId: project.id })
      .then((info) => {
        if (!cancelled) {
          setRepoInfo(info);
          setRepoLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRepoInfo([]);
          setRepoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const handleLaunchSession = (resumeSessionId?: string, sessionCwd?: string) => {
    setPendingResumeSessionId(resumeSessionId);
    void createTerminal(defaultKey, resumeSessionId, sessionCwd);
  };

  const handleBack = () => {
    resetToSessions(defaultKey);
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
            <div className="text-sm font-medium text-zinc-100">{project.name}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <GitSyncButton projectId={project.id} repoInfo={repoInfo} onSynced={setRepoInfo} />
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() =>
              void transport.request("files.openInEditor", { workspaceId: defaultKey })
            }
            title="Open in editor"
          >
            <Code size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() =>
              void transport.request("files.openInExplorer", { workspaceId: defaultKey })
            }
            title="Open in file explorer"
          >
            <FolderOpen size={14} />
          </Button>
        </div>
      </div>

      {hasTerminal ? (
        <TerminalView
          taskId={defaultKey}
          {...(pendingResumeSessionId ? { resumeSessionId: pendingResumeSessionId } : {})}
        />
      ) : (
        <DefaultWorkspaceDetailView
          project={project}
          repoInfo={repoInfo}
          repoLoading={repoLoading}
          setRepoInfo={setRepoInfo}
          onLaunchSession={handleLaunchSession}
        />
      )}
    </div>
  );
}

function DefaultWorkspaceDetailView({
  project,
  repoInfo,
  repoLoading,
  setRepoInfo,
  onLaunchSession,
}: {
  project: Project;
  repoInfo: RepoInfo[];
  repoLoading: boolean;
  setRepoInfo: (info: RepoInfo[]) => void;
  onLaunchSession: (resumeSessionId?: string) => void;
}) {
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<string | null>(null);
  const { updateProject } = useAppStore();

  const {
    isRegenerating,
    showEmptyBanner,
    messages,
    result,
    error,
    handleStartRegenerate,
    cancel,
  } = useRegenerate({
    entityId: project.id,
    filePath: `${project.slug}/PROJECT.md`,
    regenerateFn: () =>
      transport.request("projects.analyze", {
        projectId: project.id,
        description: project.description ?? "",
      }),
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <RegenerationBanner
        isRegenerating={isRegenerating}
        showEmptyBanner={showEmptyBanner}
        error={error}
        messages={messages}
        fileName="PROJECT.md"
        onGenerate={() => void handleStartRegenerate()}
        onCancel={cancel}
      />

      {!showEmptyBanner && !isRegenerating && (
        <div className="mb-6">
          <SectionHeader title="System Prompts" />
          <PromptPreview
            filePath={`${project.slug}/PROJECT.md`}
            label="PROJECT.md"
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
                title="Regenerate PROJECT.md"
              >
                <Sparkles size={12} />
                Regenerate PROJECT.md
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-2">
          {repoLoading ? (
            Array.from({ length: project.repoSources.length || 1 }, (_, i) => (
              <RepoSkeleton key={i} />
            ))
          ) : repoInfo.length === 0 ? (
            <EmptyState message="No repos yet. Add a repo to get started." />
          ) : (
            repoInfo.map((repo) => (
              <RepoCard key={repo.name} repo={repo} onRemove={() => setRepoToDelete(repo.name)} />
            ))
          )}
        </div>

        <Button variant="dashed" size="sm" className="mt-3" onClick={() => setShowAddRepo(true)}>
          <Plus size={14} />
          Add Repo
        </Button>
      </div>

      <div className="mb-6">
        <EnvEditor workspaceId={`${project.id}/default`} repos={repoInfo.map((r) => r.name)} />
      </div>

      <div>
        <SessionList projectId={project.id} onLaunch={onLaunchSession} />
      </div>

      <AddRepoDialog
        open={showAddRepo}
        onClose={() => setShowAddRepo(false)}
        onAdd={async (input) => {
          await transport.request("repos.add", { projectId: project.id, ...input });
          const info = await transport.request("repos.getInfo", { projectId: project.id });
          setRepoInfo(info);
        }}
      />

      <ConfirmDialog
        open={repoToDelete !== null}
        title="Remove Repo"
        description={`Remove "${repoToDelete}" from this project?`}
        details={
          <div className="mt-2 text-xs text-zinc-500">
            <p>
              The repo directory in default/ will be deleted. Worktrees in active tasks will be
              removed.
            </p>
          </div>
        }
        confirmText="Remove Repo"
        confirmVariant="danger"
        onConfirm={async () => {
          await updateProject(project.id, {
            repoSources: project.repoSources.filter((s) => {
              const name =
                s
                  .split("/")
                  .pop()
                  ?.replace(/\.git\/?$/, "") || s;
              return name !== repoToDelete;
            }),
          });
          setRepoToDelete(null);
          const info = await transport.request("repos.getInfo", { projectId: project.id });
          setRepoInfo(info);
        }}
        onCancel={() => setRepoToDelete(null)}
      />
    </div>
  );
}
