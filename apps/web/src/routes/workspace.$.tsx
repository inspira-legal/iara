import { useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GitFork } from "lucide-react";
import { useAppStore } from "~/stores/app";
import { useActiveSessionStore } from "~/stores/activeSession";
import { useRepoPolling } from "~/hooks/useRepoPolling";
import { RepoCard } from "~/components/RepoCard";
import { SessionList } from "~/components/SessionList";
import { WorkspacePicker } from "~/components/WorkspacePicker";
import { SectionHeader } from "~/components/ui/SectionHeader";
import { EmptyState } from "~/components/ui/EmptyState";

export const Route = createFileRoute("/workspace/$")({
  component: WorkspaceDetailPage,
});

function WorkspaceDetailPage() {
  const { _splat: workspaceId } = Route.useParams();
  const navigate = useNavigate();

  const workspace = useAppStore((s) => s.getWorkspace(workspaceId!));
  const project = useAppStore((s) => {
    const projectId = workspaceId!.split("/")[0]!;
    return s.getProject(projectId);
  });
  const repoInfo = useAppStore((s) => s.getRepoInfo(workspaceId!));
  useRepoPolling(workspaceId);

  // Redirect if workspace doesn't exist
  useEffect(() => {
    if (!workspace) {
      void navigate({ to: "/" });
    }
  }, [workspace, navigate]);

  const handleLaunch = useCallback(
    async (resumeSessionId?: string, sessionCwd?: string) => {
      if (!workspaceId) return;
      const opts: { resumeSessionId?: string; sessionCwd?: string } = {};
      if (resumeSessionId) opts.resumeSessionId = resumeSessionId;
      if (sessionCwd) opts.sessionCwd = sessionCwd;
      const id = await useActiveSessionStore.getState().create(workspaceId, opts);
      void navigate({ to: "/session/$id", params: { id } } as any);
    },
    [workspaceId, navigate],
  );

  if (!project || !workspace || !workspaceId) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-6">
        <WorkspacePicker
          currentWorkspaceId={workspaceId}
          onSelect={(wsId) => {
            useAppStore.getState().selectWorkspace(wsId);
            void navigate({ to: `/workspace/${wsId}` } as any);
          }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl space-y-8">
          {/* Repos */}
          <div>
            <SectionHeader title="Repos" />
            {repoInfo.length === 0 ? (
              <EmptyState icon={GitFork} message="No repos in this workspace." />
            ) : (
              <div className="space-y-2">
                {repoInfo.map((repo) => (
                  <RepoCard
                    key={repo.name}
                    repo={repo}
                    workspaceId={workspaceId}
                    projectId={project.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sessions */}
          <div>
            <SessionList
              workspaceId={workspaceId}
              onLaunch={(resumeSessionId, sessionCwd) =>
                void handleLaunch(resumeSessionId, sessionCwd)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
