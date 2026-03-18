import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";

interface EditableNameProps {
  value: string;
  onSave: (newName: string) => Promise<void> | void;
}

export function EditableName({ value, onSave }: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when value changes externally
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    await onSave(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      cancel();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => void save()}
        className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-xl font-semibold text-zinc-100 outline-none focus:border-blue-500"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group mt-1 flex items-center gap-2 text-left"
    >
      <h2 className="text-xl font-semibold text-zinc-100">{value}</h2>
      <Pencil
        size={14}
        className="text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
