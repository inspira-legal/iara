import { AlertTriangle } from "lucide-react";
import { useAppStore } from "~/stores/app";

export function ClaudeUnavailableOverlay() {
  const isWindowsServer = useAppStore((s) => s.capabilities.platform === "win32");

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/90">
      <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center" role="alert">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
          <AlertTriangle size={24} className="text-amber-400" />
        </div>
        <div className="space-y-2">
          <p className="text-base font-medium text-zinc-200">Claude CLI is not available</p>
          <p className="text-sm text-zinc-400">
            {isWindowsServer
              ? "Install WSL and Claude CLI inside it to use Claude terminals on Windows."
              : "Install the Claude CLI to use Claude terminals."}
          </p>
        </div>
        <a
          href="https://docs.anthropic.com/en/docs/claude-code/overview"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 underline hover:text-blue-300"
        >
          Installation guide
        </a>
      </div>
    </div>
  );
}
