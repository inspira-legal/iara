import { useEffect, useLayoutEffect, useRef, useCallback, useState } from "react";
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
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % items.length);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + items.length) % items.length);
          break;
        }
        case "Home": {
          e.preventDefault();
          setFocusedIndex(0);
          break;
        }
        case "End": {
          e.preventDefault();
          setFocusedIndex(items.length - 1);
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          const item = items[focusedIndex];
          if (item && !item.disabled) {
            item.onClick();
            onClose();
          }
          break;
        }
      }
    },
    [onClose, items, focusedIndex],
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Focus the active menu item when focusedIndex changes
  useEffect(() => {
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [handleKeyDown, handleClick]);

  // Focus first item on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      itemRefs.current[0]?.focus();
    });
  }, []);

  // Adjust position to stay within viewport (useLayoutEffect to avoid flash)
  useLayoutEffect(() => {
    const el = menuRef.current;
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
  }, []);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      className="fixed z-50 min-w-[160px] animate-in fade-in zoom-in-95 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => (
        <button
          key={item.label}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          type="button"
          role="menuitem"
          tabIndex={index === focusedIndex ? 0 : -1}
          disabled={item.disabled}
          onMouseEnter={() => setFocusedIndex(index)}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-none disabled:opacity-40 ${
            item.variant === "danger"
              ? "text-red-400 hover:bg-red-950/50 hover:text-red-300 focus:bg-red-950/50 focus:text-red-300"
              : "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 focus:bg-zinc-700 focus:text-zinc-100"
          }`}
        >
          {item.icon && <item.icon size={14} className="shrink-0" />}
          {item.label}
        </button>
      ))}
    </div>
  );
}
