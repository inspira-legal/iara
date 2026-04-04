import { useState } from "react";
import { AlertTriangle } from "lucide-react";

export function ClaudeUnavailableBanner() {
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
