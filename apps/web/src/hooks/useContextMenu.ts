import { useState, useCallback } from "react";

interface ContextMenuState {
  x: number;
  y: number;
}

interface UseContextMenuReturn {
  position: ContextMenuState | null;
  handleContextMenu: (e: React.MouseEvent) => void;
  close: () => void;
}

export function useContextMenu(): UseContextMenuReturn {
  const [position, setPosition] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => {
    setPosition(null);
  }, []);

  return { position, handleContextMenu, close };
}
