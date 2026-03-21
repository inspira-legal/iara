import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const STORAGE_KEY = "iara:sidebar-state:v2";

const storageData: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => storageData[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageData[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storageData[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(storageData)) {
      delete storageData[key];
    }
  }),
  get length() {
    return Object.keys(storageData).length;
  },
  key: vi.fn(() => null),
};

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

import { useSidebarStore } from "./sidebar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  expandedProjectIds: new Set<string>(),
  projectOrder: [] as string[],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  useSidebarStore.setState(INITIAL_STATE);
});

describe("useSidebarStore", () => {
  // -----------------------------------------------------------------------
  // toggleProject
  // -----------------------------------------------------------------------

  describe("toggleProject()", () => {
    it("expands a collapsed project", () => {
      useSidebarStore.getState().toggleProject("proj1");
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(true);
    });

    it("collapses an expanded project", () => {
      useSidebarStore.setState({ expandedProjectIds: new Set(["proj1"]) });
      useSidebarStore.getState().toggleProject("proj1");
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(false);
    });

    it("toggles independently for different projects", () => {
      useSidebarStore.getState().toggleProject("proj1");
      useSidebarStore.getState().toggleProject("proj2");
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(true);
      expect(useSidebarStore.getState().expandedProjectIds.has("proj2")).toBe(true);

      useSidebarStore.getState().toggleProject("proj1");
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(false);
      expect(useSidebarStore.getState().expandedProjectIds.has("proj2")).toBe(true);
    });

    it("saves to localStorage after toggle", () => {
      useSidebarStore.getState().toggleProject("proj1");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
      const saved = JSON.parse(localStorageMock.setItem.mock.calls[0]![1] as string);
      expect(saved.expandedProjectIds).toContain("proj1");
    });
  });

  // -----------------------------------------------------------------------
  // expandProject
  // -----------------------------------------------------------------------

  describe("expandProject()", () => {
    it("adds project to expanded set", () => {
      useSidebarStore.getState().expandProject("proj1");
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(true);
    });

    it("is a no-op if already expanded", () => {
      useSidebarStore.setState({ expandedProjectIds: new Set(["proj1"]) });
      useSidebarStore.getState().expandProject("proj1");
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(true);
      // Should not have called setItem since state didn't change
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it("saves to localStorage", () => {
      useSidebarStore.getState().expandProject("proj1");
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // collapseProject
  // -----------------------------------------------------------------------

  describe("collapseProject()", () => {
    it("removes project from expanded set", () => {
      useSidebarStore.setState({ expandedProjectIds: new Set(["proj1"]) });
      useSidebarStore.getState().collapseProject("proj1");
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(false);
    });

    it("is a no-op if already collapsed", () => {
      useSidebarStore.getState().collapseProject("proj1");
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(false);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // setProjectOrder
  // -----------------------------------------------------------------------

  describe("setProjectOrder()", () => {
    it("sets project order", () => {
      useSidebarStore.getState().setProjectOrder(["proj2", "proj1", "proj3"]);
      expect(useSidebarStore.getState().projectOrder).toEqual(["proj2", "proj1", "proj3"]);
    });

    it("saves to localStorage", () => {
      useSidebarStore.getState().setProjectOrder(["proj1"]);
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const saved = JSON.parse(localStorageMock.setItem.mock.calls[0]![1] as string);
      expect(saved.projectOrder).toEqual(["proj1"]);
    });
  });

  // -----------------------------------------------------------------------
  // hydrateFromStorage
  // -----------------------------------------------------------------------

  describe("hydrateFromStorage()", () => {
    it("reads from localStorage and sets state", () => {
      storageData[STORAGE_KEY] = JSON.stringify({
        expandedProjectIds: ["proj1", "proj2"],
        projectOrder: ["proj2", "proj1"],
      });

      useSidebarStore.getState().hydrateFromStorage();

      expect(useSidebarStore.getState().expandedProjectIds).toEqual(new Set(["proj1", "proj2"]));
      expect(useSidebarStore.getState().projectOrder).toEqual(["proj2", "proj1"]);
    });

    it("handles empty localStorage gracefully", () => {
      useSidebarStore.getState().hydrateFromStorage();

      // Should remain at defaults
      expect(useSidebarStore.getState().expandedProjectIds).toEqual(new Set());
      expect(useSidebarStore.getState().projectOrder).toEqual([]);
    });

    it("handles invalid JSON gracefully", () => {
      storageData[STORAGE_KEY] = "not valid json";

      useSidebarStore.getState().hydrateFromStorage();

      // Should remain at defaults - no crash
      expect(useSidebarStore.getState().expandedProjectIds).toEqual(new Set());
    });

    it("defaults missing fields", () => {
      storageData[STORAGE_KEY] = JSON.stringify({});

      useSidebarStore.getState().hydrateFromStorage();

      expect(useSidebarStore.getState().expandedProjectIds).toEqual(new Set());
      expect(useSidebarStore.getState().projectOrder).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // removeProject
  // -----------------------------------------------------------------------

  describe("removeProject()", () => {
    it("removes project from expanded set and order", () => {
      useSidebarStore.setState({
        expandedProjectIds: new Set(["proj1", "proj2"]),
        projectOrder: ["proj1", "proj2", "proj3"],
      });

      useSidebarStore.getState().removeProject("proj2");

      expect(useSidebarStore.getState().expandedProjectIds.has("proj2")).toBe(false);
      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(true);
      expect(useSidebarStore.getState().projectOrder).toEqual(["proj1", "proj3"]);
    });

    it("saves to localStorage after removal", () => {
      useSidebarStore.setState({
        expandedProjectIds: new Set(["proj1"]),
        projectOrder: ["proj1"],
      });

      useSidebarStore.getState().removeProject("proj1");

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it("handles removing a project that does not exist", () => {
      useSidebarStore.setState({
        expandedProjectIds: new Set(["proj1"]),
        projectOrder: ["proj1"],
      });

      useSidebarStore.getState().removeProject("nonexistent");

      expect(useSidebarStore.getState().expandedProjectIds).toEqual(new Set(["proj1"]));
      expect(useSidebarStore.getState().projectOrder).toEqual(["proj1"]);
    });
  });

  // -----------------------------------------------------------------------
  // Persistence round-trip
  // -----------------------------------------------------------------------

  describe("persistence round-trip", () => {
    it("state saved by one action can be hydrated back", () => {
      useSidebarStore.getState().expandProject("proj1");
      useSidebarStore.getState().setProjectOrder(["proj1", "proj2"]);

      // Reset store
      useSidebarStore.setState(INITIAL_STATE);
      expect(useSidebarStore.getState().expandedProjectIds).toEqual(new Set());

      // Hydrate
      useSidebarStore.getState().hydrateFromStorage();

      expect(useSidebarStore.getState().expandedProjectIds.has("proj1")).toBe(true);
      expect(useSidebarStore.getState().projectOrder).toEqual(["proj1", "proj2"]);
    });
  });
});
