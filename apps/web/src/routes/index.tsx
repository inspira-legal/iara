import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GitBranch, Plus } from "lucide-react";
import { useAppStore } from "~/stores/app";
import { CreateProjectDialog } from "~/components/CreateProjectDialog";
import { Button } from "~/components/ui/Button";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function HomePage() {
  const projects = useAppStore((s) => s.projects);
  const userName = useAppStore((s) => s.capabilities.userName);
  const sessions = useAppStore((s) => s.sessions);
  const navigate = useNavigate();

  const isNewUser = projects.length === 0;

  const recentWorkspaces = useMemo(() => {
    if (isNewUser) return [];

    const wsWithActivity: {
      id: string;
      projectName: string;
      workspaceName: string;
      lastActivity: number;
    }[] = [];

    for (const project of projects) {
      for (const ws of project.workspaces) {
        const wsSessions = sessions[ws.id] ?? [];
        const projectSessions = sessions[`project:${project.id}`] ?? [];
        const allSessions = [...wsSessions, ...projectSessions];

        let latest = 0;
        for (const s of allSessions) {
          const t = new Date(s.lastMessageAt).getTime();
          if (t > latest) latest = t;
        }

        wsWithActivity.push({
          id: ws.id,
          projectName: project.name,
          workspaceName: ws.name,
          lastActivity: latest,
        });
      }
    }

    return wsWithActivity.toSorted((a, b) => b.lastActivity - a.lastActivity).slice(0, 8);
  }, [projects, sessions, isNewUser]);

  const greeting = getGreeting();
  const displayName = userName ? `, ${userName}` : "";

  if (isNewUser) {
    return <WelcomeScreen greeting={greeting} displayName={displayName} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold text-zinc-200">
          {greeting}
          {displayName}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">Where do you want to start?</p>

        {recentWorkspaces.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {recentWorkspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => {
                  useAppStore.getState().selectWorkspace(ws.id);
                  void navigate({ to: `/workspace/${ws.id}` } as any);
                }}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50"
              >
                <GitBranch size={13} className="shrink-0 text-zinc-600" />
                <span>
                  {ws.projectName} / {ws.workspaceName}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeScreen({ greeting, displayName }: { greeting: string; displayName: string }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-200">
          {greeting}
          {displayName}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Welcome to iara. Import a git repo to get started.
        </p>

        <div className="mt-8">
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            Create Project
          </Button>
        </div>
      </div>

      <CreateProjectDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
