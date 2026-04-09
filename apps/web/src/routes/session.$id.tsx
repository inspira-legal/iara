import { useEffect, useState, useCallback, type RefCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { useAppStore } from "~/stores/app";
import { useActiveSessionStore } from "~/stores/activeSession";
import { ConnectedTerminal, destroyXTermInstance } from "~/components/ConnectedTerminal";
import { ClaudeUnavailableOverlay } from "~/components/ClaudeUnavailableOverlay";
import { WorkspaceHeader } from "~/components/WorkspaceHeader";
import { Button } from "~/components/ui/Button";

export const Route = createFileRoute("/session/$id")({
  component: ActiveSessionView,
});

function ActiveSessionView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const entry = useActiveSessionStore((s) => s.getEntry(id));
  const restartSession = useActiveSessionStore((s) => s.restart);

  const workspace = useAppStore((s) => s.getWorkspace(entry.workspaceId));
  const project = useAppStore((s) => {
    if (!entry.workspaceId) return undefined;
    const projectId = entry.workspaceId.split("/")[0]!;
    return s.getProject(projectId);
  });
  const repoInfo = useAppStore((s) => s.getRepoInfo(entry.workspaceId));

  // Redirect to home if the session entry doesn't exist (id not in store)
  const entryExists = useActiveSessionStore((s) => s.entries.has(id));
  useEffect(() => {
    if (!entryExists) {
      void navigate({ to: "/" });
    }
  }, [entryExists, navigate]);

  const { terminalId, status, exitCode, errorCode, hasData } = entry;
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    if (hasData) return;
    const timer = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [status, hasData]);

  // Cleanup xterm instance on terminal exit
  useEffect(() => {
    if (status === "exited" && terminalId) {
      destroyXTermInstance(`claude:${terminalId}`);
    }
  }, [status, terminalId]);

  const handleRestart = useCallback(() => {
    void restartSession(id);
  }, [restartSession, id]);

  const restartButtonRef: RefCallback<HTMLButtonElement> = useCallback((node) => {
    node?.focus();
  }, []);

  if (!entryExists) return null;

  const showLoading = !timedOut && (status === "connecting" || (status === "active" && !hasData));
  const showStartupError = timedOut && !hasData && status !== "exited";
  const isClaudeUnavailable = errorCode === "CLAUDE_NOT_AVAILABLE";

  return (
    <div className="flex h-full flex-col">
      {project && workspace && (
        <WorkspaceHeader
          project={project}
          workspace={workspace}
          repoInfo={repoInfo}
          sessionTitle={entry.title ?? entry.initialPrompt?.split("\n")[0]}
        />
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <ConnectedTerminal
          terminalId={terminalId}
          instancePrefix="claude"
          blockSuspend
          className="p-3"
        />
        {status === "exited" && isClaudeUnavailable && <ClaudeUnavailableOverlay />}
        {status === "exited" && !isClaudeUnavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80">
            <div
              className="flex flex-col items-center gap-3 text-zinc-400"
              role="alert"
              aria-live="polite"
            >
              <p className="text-sm">
                {exitCode === 0 || exitCode == null
                  ? "Session ended"
                  : `Claude exited unexpectedly (code ${exitCode})`}
              </p>
              <Button ref={restartButtonRef} variant="primary" size="sm" onClick={handleRestart}>
                <RotateCw size={14} />
                Restart
              </Button>
            </div>
          </div>
        )}
        {showStartupError && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80">
            <div
              className="flex flex-col items-center gap-3 text-zinc-400"
              role="alert"
              aria-live="polite"
            >
              <p className="text-sm">Claude failed to start</p>
              <Button variant="primary" size="sm" onClick={handleRestart}>
                <RotateCw size={14} />
                Retry
              </Button>
            </div>
          </div>
        )}
        {showLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-zinc-950"
            role="status"
          >
            <p className="text-sm text-zinc-500">Starting Claude...</p>
          </div>
        )}
      </div>
    </div>
  );
}
