import { useEffect, useCallback, useRef, useId } from "react";
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
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Use refs for callback values so the keydown listener stays stable
  const onCloseRef = useRef(onClose);
  const disabledRef = useRef(disabled);
  onCloseRef.current = onClose;
  disabledRef.current = disabled;

  // Stable keydown handler — never recreated, reads current values via refs
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && !disabledRef.current) {
      onCloseRef.current();
      return;
    }

    // Focus trap: cycle focus within the dialog
    if (e.key === "Tab" && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, []);

  // Save previous focus, restore on close, and manage listeners
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", handleKeyDown);

    // Focus the dialog panel on open
    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the element that opened the dialog
      previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !disabled) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "w-full rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl outline-none",
          maxWidth,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {backButton && (
              <button
                type="button"
                onClick={backButton}
                aria-label="Go back"
                className="rounded text-zinc-500 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            aria-label="Close dialog"
            className="rounded text-zinc-500 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
