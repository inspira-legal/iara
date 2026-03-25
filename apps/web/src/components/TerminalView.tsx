import { useState, useEffect, useCallback, type RefCallback } from "react";
import "@xterm/xterm/css/xterm.css";
import { ConnectedTerminal, destroyXTermInstance } from "~/components/ConnectedTerminal";
import { useTerminalStore } from "~/stores/terminal";
import { RotateCw } from "lucide-react";

interface TerminalViewProps {
  workspaceId: string;
  resumeSessionId?: string;
}

export function TerminalView({ workspaceId, resumeSessionId }: TerminalViewProps) {
  const entry = useTerminalStore((s) => s.getEntry(workspaceId));
  const createTerminal = useTerminalStore((s) => s.create);
  const restartTerminal = useTerminalStore((s) => s.restart);
  const { terminalId, status, exitCode, hasData } = entry;
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    if (hasData) return;
    const timer = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [workspaceId, status, hasData]);

  useEffect(() => {
    if (status === "idle") {
      void createTerminal(workspaceId, resumeSessionId);
    }
  }, [status, createTerminal, workspaceId, resumeSessionId]);

  // Cleanup xterm instance on terminal exit
  useEffect(() => {
    if (status === "exited" && terminalId) {
      destroyXTermInstance(`claude:${terminalId}`);
    }
  }, [status, terminalId]);

  const handleRestart = useCallback(() => {
    void restartTerminal(workspaceId);
  }, [restartTerminal, workspaceId]);

  const restartButtonRef: RefCallback<HTMLButtonElement> = useCallback((node) => {
    node?.focus();
  }, []);

  const showLoading = !timedOut && (status === "connecting" || (status === "active" && !hasData));
  const showStartupError = timedOut && !hasData && status !== "exited";

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <ConnectedTerminal terminalId={terminalId} instancePrefix="claude" className="p-3" />
      {status === "exited" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80">
          <div className="flex flex-col items-center gap-3 text-zinc-400" role="alert">
            <p className="text-sm">Claude exited{exitCode != null ? ` (code ${exitCode})` : ""}</p>
            <button
              ref={restartButtonRef}
              type="button"
              onClick={handleRestart}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              <RotateCw size={14} />
              Restart
            </button>
          </div>
        </div>
      )}
      {showStartupError && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80">
          <div className="flex flex-col items-center gap-3 text-zinc-400" role="alert">
            <p className="text-sm">Claude failed to start</p>
            <button
              type="button"
              onClick={handleRestart}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              <RotateCw size={14} />
              Retry
            </button>
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
  );
}
