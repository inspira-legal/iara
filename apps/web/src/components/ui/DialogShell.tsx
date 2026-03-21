import { useEffect, useCallback } from "react";
import { X, ArrowLeft } from "lucide-react";
import { cn } from "~/lib/utils";

interface DialogShellProps {
  open: boolean;
  title: string;
  maxWidth?: string;
  onClose: () => void;
  disabled?: boolean;
  backButton?: (() => void) | undefined;
  children: React.ReactNode;
}

export function DialogShell({
  open,
  title,
  maxWidth = "max-w-md",
  onClose,
  disabled = false,
  backButton,
  children,
}: DialogShellProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabled) onClose();
    },
    [onClose, disabled],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={cn(
          "w-full rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl",
          maxWidth,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {backButton && (
              <button
                type="button"
                onClick={backButton}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
