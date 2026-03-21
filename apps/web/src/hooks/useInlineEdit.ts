import { useState, useCallback } from "react";

interface UseInlineEditReturn {
  editing: boolean;
  draft: string;
  startEditing: () => void;
  inputProps: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onBlur: () => void;
    autoFocus: boolean;
    className: string;
  };
}

export function useInlineEdit(
  currentName: string,
  onSave: (newName: string) => Promise<void> | void,
): UseInlineEditReturn {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName);

  const startEditing = useCallback(() => {
    setDraft(currentName);
    setEditing(true);
  }, [currentName]);

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== currentName) {
      await onSave(trimmed);
    }
    setEditing(false);
  }, [draft, currentName, onSave]);

  const inputProps = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    },
    onBlur: () => void handleSave(),
    autoFocus: true as const,
    className:
      "min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-1 py-0 text-sm text-zinc-100 outline-none focus:border-blue-500",
  };

  return { editing, draft, startEditing, inputProps };
}
