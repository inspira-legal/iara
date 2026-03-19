import { useEffect, useRef, useCallback } from "react";
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

interface SidebarContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function SidebarContextMenu({ items, position, onClose }: SidebarContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [handleKeyDown, handleClick]);

  // Adjust position to stay within viewport
  const adjustedPosition = useAdjustedPosition(menuRef, position);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] animate-in fade-in zoom-in-95 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-40 ${
            item.variant === "danger"
              ? "text-red-400 hover:bg-red-950/50 hover:text-red-300"
              : "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          }`}
        >
          {item.icon && <item.icon size={14} className="shrink-0" />}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function useAdjustedPosition(
  ref: React.RefObject<HTMLDivElement | null>,
  position: { x: number; y: number },
) {
  // On first render, position at click point; adjust after measuring
  const adjusted = { x: position.x, y: position.y };

  // Use requestAnimationFrame via useEffect to adjust after paint
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      el.style.left = `${vw - rect.width - 8}px`;
    }
    if (rect.bottom > vh) {
      el.style.top = `${vh - rect.height - 8}px`;
    }
  }, [ref]);

  return adjusted;
}
