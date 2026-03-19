import { create } from "zustand";

const STORAGE_KEY = "iara:sidebar-state:v1";

interface SidebarState {
  expandedProjectIds: Set<string>;
  projectOrder: string[];
  devServerPanelOpen: boolean;
}

interface SidebarActions {
  toggleProject(id: string): void;
  expandProject(id: string): void;
  collapseProject(id: string): void;
  setProjectOrder(ids: string[]): void;
  toggleDevServerPanel(): void;
  hydrateFromStorage(): void;
  removeProject(id: string): void;
}

function loadFromStorage(): Partial<SidebarState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      expandedProjectIds: new Set(parsed.expandedProjectIds ?? []),
      projectOrder: parsed.projectOrder ?? [],
      devServerPanelOpen: parsed.devServerPanelOpen ?? true,
    };
  } catch {
    return {};
  }
}

function saveToStorage(state: SidebarState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        expandedProjectIds: [...state.expandedProjectIds],
        projectOrder: state.projectOrder,
        devServerPanelOpen: state.devServerPanelOpen,
      }),
    );
  } catch {
    // localStorage may be unavailable
  }
}

export const useSidebarStore = create<SidebarState & SidebarActions>((set) => ({
  expandedProjectIds: new Set<string>(),
  projectOrder: [],
  devServerPanelOpen: true,

  toggleProject: (id) => {
    set((state) => {
      const next = new Set(state.expandedProjectIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      const newState = { ...state, expandedProjectIds: next };
      saveToStorage(newState);
      return { expandedProjectIds: next };
    });
  },

  expandProject: (id) => {
    set((state) => {
      if (state.expandedProjectIds.has(id)) return state;
      const next = new Set(state.expandedProjectIds);
      next.add(id);
      const newState = { ...state, expandedProjectIds: next };
      saveToStorage(newState);
      return { expandedProjectIds: next };
    });
  },

  collapseProject: (id) => {
    set((state) => {
      if (!state.expandedProjectIds.has(id)) return state;
      const next = new Set(state.expandedProjectIds);
      next.delete(id);
      const newState = { ...state, expandedProjectIds: next };
      saveToStorage(newState);
      return { expandedProjectIds: next };
    });
  },

  setProjectOrder: (ids) => {
    set((state) => {
      const newState = { ...state, projectOrder: ids };
      saveToStorage(newState);
      return { projectOrder: ids };
    });
  },

  toggleDevServerPanel: () => {
    set((state) => {
      const next = !state.devServerPanelOpen;
      const newState = { ...state, devServerPanelOpen: next };
      saveToStorage(newState);
      return { devServerPanelOpen: next };
    });
  },

  hydrateFromStorage: () => {
    const stored = loadFromStorage();
    set(stored);
  },

  removeProject: (id) => {
    set((state) => {
      const nextExpanded = new Set(state.expandedProjectIds);
      nextExpanded.delete(id);
      const nextOrder = state.projectOrder.filter((pid) => pid !== id);
      const newState = { ...state, expandedProjectIds: nextExpanded, projectOrder: nextOrder };
      saveToStorage(newState);
      return { expandedProjectIds: nextExpanded, projectOrder: nextOrder };
    });
  },
}));
