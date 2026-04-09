import { useEffect, useCallback } from "react";
import { Minus } from "lucide-react";
import { useAppStore } from "~/stores/app";

function useModKey(): string {
  const isMac = useAppStore((s) => s.capabilities.platform === "darwin");
  return isMac ? "Cmd" : "Ctrl";
}

function getShortcutGroups(mod: string) {
  return [
    {
      title: "Sessions",
      shortcuts: [{ keys: [`${mod}+1`, `${mod}+9`], label: "Switch to session 1-9" }],
    },
    {
      title: "Window",
      shortcuts: [{ keys: [`${mod}+B`], label: "Toggle browser panel" }],
    },
    {
      title: "General",
      shortcuts: [
        { keys: [`${mod}+K`], label: "Go to project / workspace" },
        { keys: [`${mod}+N`], label: "New chat" },
        { keys: ["F1"], label: "Show keyboard shortcuts" },
      ],
    },
  ];
}

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  const mod = useModKey();
  const groups = getShortcutGroups(mod);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "F1") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
      >
        <h2 className="mb-4 text-sm font-semibold text-zinc-200">Keyboard Shortcuts</h2>
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-1.5 text-xs font-medium text-zinc-500">{group.title}</h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between py-1">
                    <span className="text-sm text-zinc-300">{shortcut.label}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={key} className="inline-flex items-center">
                          {i > 0 && <Minus size={10} className="mx-0.5 text-zinc-600" />}
                          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
