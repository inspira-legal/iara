import { create } from "zustand";
import { LocalCache } from "~/lib/local-cache";
import { SidebarCacheSchema } from "~/lib/cache-schemas";

const sidebarCache = new LocalCache({
  key: "iara:sidebar-state",
  version: 1,
  schema: SidebarCacheSchema,
});

const cached = sidebarCache.get();

interface SidebarState {
  expandedProjectIds: Set<string>;
  projectOrder: string[];
}

interface SidebarActions {
  toggleProject(id: string): void;
  expandProject(id: string): void;
  collapseProject(id: string): void;
  setProjectOrder(ids: string[]): void;
  hydrateFromStorage(): void;
  removeProject(id: string): void;
}

function persist(state: SidebarState) {
  sidebarCache.set({
    expandedProjectIds: [...state.expandedProjectIds],
    projectOrder: state.projectOrder,
  });
}

export const useSidebarStore = create<SidebarState & SidebarActions>((set) => ({
  expandedProjectIds: new Set<string>(cached?.expandedProjectIds ?? []),
  projectOrder: cached?.projectOrder ?? [],

  toggleProject: (id) => {
    set((state) => {
      const next = new Set(state.expandedProjectIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      const newState = { ...state, expandedProjectIds: next };
      persist(newState);
      return { expandedProjectIds: next };
    });
  },

  expandProject: (id) => {
    set((state) => {
      if (state.expandedProjectIds.has(id)) return state;
      const next = new Set(state.expandedProjectIds);
      next.add(id);
      const newState = { ...state, expandedProjectIds: next };
      persist(newState);
      return { expandedProjectIds: next };
    });
  },

  collapseProject: (id) => {
    set((state) => {
      if (!state.expandedProjectIds.has(id)) return state;
      const next = new Set(state.expandedProjectIds);
      next.delete(id);
      const newState = { ...state, expandedProjectIds: next };
      persist(newState);
      return { expandedProjectIds: next };
    });
  },

  setProjectOrder: (ids) => {
    set((state) => {
      const newState = { ...state, projectOrder: ids };
      persist(newState);
      return { projectOrder: ids };
    });
  },

  hydrateFromStorage: () => {
    const stored = sidebarCache.get();
    if (stored) {
      set({
        expandedProjectIds: new Set(stored.expandedProjectIds),
        projectOrder: stored.projectOrder,
      });
    }
  },

  removeProject: (id) => {
    set((state) => {
      const nextExpanded = new Set(state.expandedProjectIds);
      nextExpanded.delete(id);
      const nextOrder = state.projectOrder.filter((pid) => pid !== id);
      const newState = { ...state, expandedProjectIds: nextExpanded, projectOrder: nextOrder };
      persist(newState);
      return { expandedProjectIds: nextExpanded, projectOrder: nextOrder };
    });
  },
}));
