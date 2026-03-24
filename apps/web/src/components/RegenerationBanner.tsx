import { AlertCircle, FileText, Loader2, Sparkles } from "lucide-react";
import type { ClaudeProgress } from "@iara/contracts";
import { ClaudeProgressLine } from "./ClaudeProgressLine";

interface RegenerationBannerProps {
  isRegenerating: boolean;
  showEmptyBanner: boolean;
  error: string | null;
  messages: ClaudeProgress[];
  fileName: string;
  onGenerate: () => void;
  onCancel: () => void;
}

export function RegenerationBanner({
  isRegenerating,
  showEmptyBanner,
  error,
  messages,
  fileName,
  onGenerate,
  onCancel,
}: RegenerationBannerProps) {
  return (
    <>
      {/* Empty file banner */}
      {showEmptyBanner && !isRegenerating && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-yellow-700/50 bg-yellow-900/20 px-4 py-3">
          <FileText size={16} className="shrink-0 text-yellow-400" />
          <p className="flex-1 text-sm text-yellow-300">
            {fileName} is empty. Generate with Claude?
          </p>
          <button
            type="button"
            onClick={onGenerate}
            className="flex items-center gap-1.5 rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-500"
          >
            <Sparkles size={12} />
            Generate
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && !isRegenerating && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3">
          <AlertCircle size={14} className="shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-sm text-red-300">Failed to generate {fileName}</p>
            <p className="mt-1 text-xs text-red-400/70">{error}</p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
          >
            <Sparkles size={12} />
            Regenerate
          </button>
        </div>
      )}

      {/* Regenerating progress */}
      {isRegenerating && (
        <div className="mb-6 space-y-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 size={14} className="shrink-0 animate-spin text-blue-400" />
            <span>Generating {fileName}...</span>
          </div>
          {messages.length > 0 && (
            <div>
              {messages.slice(-3).map((msg) => (
                <ClaudeProgressLine
                  key={
                    msg.type === "status"
                      ? msg.message
                      : msg.type === "tool"
                        ? msg.tool
                        : msg.content
                  }
                  progress={msg}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
