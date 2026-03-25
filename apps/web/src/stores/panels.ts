import { create } from "zustand";
import { LocalCache } from "~/lib/local-cache";
import { z } from "zod";

const PanelsCacheSchema = z.object({
  rightPanelWidth: z.number(),
});

const panelsCache = new LocalCache({
  key: "iara:panels",
  version: 1,
  schema: PanelsCacheSchema,
});

const cached = panelsCache.get();

interface PanelsState {
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  editingProjectId: string | null;
}

interface PanelsActions {
  toggleRightPanel(): void;
  openRightPanel(): void;
  closeRightPanel(): void;
  setRightPanelWidth(width: number): void;
  setEditingProjectId(id: string | null): void;
}

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 500;

export const usePanelsStore = create<PanelsState & PanelsActions>((set, get) => ({
  rightPanelOpen: false,
  rightPanelWidth: cached?.rightPanelWidth ?? DEFAULT_WIDTH,
  editingProjectId: null,

  toggleRightPanel: () => {
    set((s) => ({ rightPanelOpen: !s.rightPanelOpen }));
  },

  openRightPanel: () => {
    set({ rightPanelOpen: true });
  },

  closeRightPanel: () => {
    set({ rightPanelOpen: false });
  },

  setRightPanelWidth: (width) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
    set({ rightPanelWidth: clamped });
    panelsCache.set({ rightPanelWidth: clamped });
  },

  setEditingProjectId: (id) => {
    set({ editingProjectId: id, rightPanelOpen: id ? false : get().rightPanelOpen });
  },
}));
