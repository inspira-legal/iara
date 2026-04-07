import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }
  }),
  get length() {
    return Object.keys(localStorageStore).length;
  },
  key: vi.fn((index: number) => Object.keys(localStorageStore)[index] ?? null),
};

vi.stubGlobal("localStorage", localStorageMock);

import { usePanelsStore } from "./panels";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  rightPanelOpen: false,
  rightPanelWidth: 360, // DEFAULT_WIDTH
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  usePanelsStore.setState(INITIAL_STATE);
});

describe("usePanelsStore", () => {
  // -----------------------------------------------------------------------
  // toggleRightPanel
  // -----------------------------------------------------------------------

  describe("toggleRightPanel()", () => {
    it("opens panel when closed", () => {
      usePanelsStore.setState({ rightPanelOpen: false });
      usePanelsStore.getState().toggleRightPanel();
      expect(usePanelsStore.getState().rightPanelOpen).toBe(true);
    });

    it("closes panel when open", () => {
      usePanelsStore.setState({ rightPanelOpen: true });
      usePanelsStore.getState().toggleRightPanel();
      expect(usePanelsStore.getState().rightPanelOpen).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // openRightPanel / closeRightPanel
  // -----------------------------------------------------------------------

  describe("openRightPanel()", () => {
    it("sets rightPanelOpen to true", () => {
      usePanelsStore.setState({ rightPanelOpen: false });
      usePanelsStore.getState().openRightPanel();
      expect(usePanelsStore.getState().rightPanelOpen).toBe(true);
    });
  });

  describe("closeRightPanel()", () => {
    it("sets rightPanelOpen to false", () => {
      usePanelsStore.setState({ rightPanelOpen: true });
      usePanelsStore.getState().closeRightPanel();
      expect(usePanelsStore.getState().rightPanelOpen).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setRightPanelWidth — clamp logic
  // -----------------------------------------------------------------------

  describe("setRightPanelWidth()", () => {
    it("sets width within valid range", () => {
      usePanelsStore.getState().setRightPanelWidth(400);
      expect(usePanelsStore.getState().rightPanelWidth).toBe(400);
    });

    it("clamps width below MIN_WIDTH (280) to 280", () => {
      usePanelsStore.getState().setRightPanelWidth(100);
      expect(usePanelsStore.getState().rightPanelWidth).toBe(280);
    });

    it("clamps width above MAX_WIDTH (500) to 500", () => {
      usePanelsStore.getState().setRightPanelWidth(800);
      expect(usePanelsStore.getState().rightPanelWidth).toBe(500);
    });

    it("clamps width at exact MIN_WIDTH boundary", () => {
      usePanelsStore.getState().setRightPanelWidth(280);
      expect(usePanelsStore.getState().rightPanelWidth).toBe(280);
    });

    it("clamps width at exact MAX_WIDTH boundary", () => {
      usePanelsStore.getState().setRightPanelWidth(500);
      expect(usePanelsStore.getState().rightPanelWidth).toBe(500);
    });

    it("persists clamped width to cache", () => {
      usePanelsStore.getState().setRightPanelWidth(400);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });
});
