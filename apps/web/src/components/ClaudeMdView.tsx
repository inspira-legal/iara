import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Pencil, X, Check } from "lucide-react";
import { transport } from "~/lib/ws-transport.js";
import { Button } from "./ui/Button";

const REMARK_PLUGINS = [remarkGfm];

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

interface ClaudeMdViewProps {
  filePath: string;
  refreshKey?: number;
  onEditProject?: () => void;
}

export function ClaudeMdView({ filePath, refreshKey = 0, onEditProject }: ClaudeMdViewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-resize textarea and focus when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      autoResize(textareaRef.current);
    }
  }, [editing]);

  const isEmpty = content === null || content.trim().length < 10;

  const handleEdit = () => {
    setDraft(content ?? "");
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await transport.request("prompts.write", { filePath, content: draft });
      setContent(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-xs text-zinc-500">Loading...</div>;
  }

  if (isEmpty && !editing) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-700/60 px-6 py-10 text-center">
        <FileText size={20} className="text-zinc-600" />
        <p className="text-sm text-zinc-500">No project description yet.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleEdit}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Write one
          </button>
          {onEditProject && (
            <>
              <span className="text-xs text-zinc-600">or</span>
              <button
                type="button"
                onClick={onEditProject}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Generate with AI
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
            <X size={12} />
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={saving}>
            <Check size={12} />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            autoResize(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleCancel();
            if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSave();
            }
          }}
          className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-300 outline-none focus:border-blue-500/50"
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={handleEdit}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-400 hover:bg-zinc-800"
        >
          <Pencil size={12} />
          Edit
        </button>
      </div>
      <div className="claude-md-prose">
        <Markdown remarkPlugins={REMARK_PLUGINS}>{content}</Markdown>
      </div>
    </div>
  );
}
