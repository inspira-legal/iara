import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, ExternalLink } from "lucide-react";
import { transport } from "~/lib/ws-transport.js";

interface PromptPreviewProps {
  /** Relative path to the .md file (e.g. "slug/CLAUDE.md") */
  filePath: string;
  /** Label shown in the header */
  label: string;
  /** Re-fetch trigger — increment to reload content */
  refreshKey?: number;
}

export function PromptPreview({ filePath, label, refreshKey = 0 }: PromptPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load content when filePath or refreshKey changes (not when expanded toggles)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    transport
      .request("prompts.read", { filePath })
      .then((result) => {
        if (!cancelled) {
          setContent(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, refreshKey]);

  const handleOpenInEditor = () => {
    void transport.request("files.open", { filePath });
  };

  const isEmpty = content !== null && content.trim().length < 10;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-sm font-medium text-zinc-300 hover:text-zinc-100"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FileText size={14} className="text-zinc-500" />
        {label}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md border border-zinc-700 bg-zinc-800/50">
          {loading ? (
            <div className="px-3 py-4 text-xs text-zinc-500">Loading...</div>
          ) : isEmpty || content === null ? (
            <div className="px-3 py-4 text-xs text-zinc-500 italic">Empty or not generated yet</div>
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs text-zinc-400">
              {content}
            </pre>
          )}
          <div className="flex items-center border-t border-zinc-700 px-3 py-1.5">
            <button
              type="button"
              onClick={handleOpenInEditor}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <ExternalLink size={12} />
              Open in editor
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
