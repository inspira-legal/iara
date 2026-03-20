import { create } from "zustand";

const STORAGE_KEY = "iara:sidebar-state:v2";

interface SidebarState {
  expandedProjectIds: Set<string>;
  projectOrder: string[];
  sidebarWidth: number;
}

interface SidebarActions {
  toggleProject(id: string): void;
  expandProject(id: string): void;
  collapseProject(id: string): void;
  setProjectOrder(ids: string[]): void;
  setSidebarWidth(width: number): void;
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
      sidebarWidth: parsed.sidebarWidth ?? 256,
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
        sidebarWidth: state.sidebarWidth,
      }),
    );
  } catch {
    // localStorage may be unavailable
  }
}

export const useSidebarStore = create<SidebarState & SidebarActions>((set) => ({
  expandedProjectIds: new Set<string>(),
  projectOrder: [],
  sidebarWidth: 256,

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

  setSidebarWidth: (width) => {
    set((state) => {
      const clamped = Math.max(200, Math.min(480, width));
      const newState = { ...state, sidebarWidth: clamped };
      saveToStorage(newState);
      return { sidebarWidth: clamped };
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
