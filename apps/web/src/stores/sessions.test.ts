import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo } from "@iara/contracts";

// ---------------------------------------------------------------------------
// Transport mock
// ---------------------------------------------------------------------------

const { mockRequest, mockSubscribe } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockSubscribe: vi.fn(() => vi.fn()),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
  },
}));

// Must import after vi.mock
import { useSessionStore } from "./sessions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "session-1",
    filePath: "/tmp/session-1.json",
    cwd: "/home/user/project",
    title: "Test Session",
    createdAt: "2025-01-01T00:00:00Z",
    lastMessageAt: "2025-01-01T01:00:00Z",
    messageCount: 5,
    ...overrides,
  };
}

const INITIAL_STATE = {
  sessionsByWorkspace: new Map<string, SessionInfo[]>(),
  sessionsByProject: new Map<string, SessionInfo[]>(),
  loading: new Map<string, boolean>(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState(INITIAL_STATE);
});

describe("useSessionStore", () => {
  // -----------------------------------------------------------------------
  // loadForWorkspace
  // -----------------------------------------------------------------------

  describe("loadForWorkspace()", () => {
    it("sets loading, calls transport, then stores sessions", async () => {
      const sessions = [makeSession({ id: "s1" }), makeSession({ id: "s2" })];
      mockRequest.mockResolvedValueOnce(sessions);

      const promise = useSessionStore.getState().loadForWorkspace("proj1/ws1");

      // loading should be true immediately
      expect(useSessionStore.getState().loading.get("ws:proj1/ws1")).toBe(true);

      await promise;

      expect(mockRequest).toHaveBeenCalledWith("sessions.list", { workspaceId: "proj1/ws1" });
      expect(useSessionStore.getState().sessionsByWorkspace.get("proj1/ws1")).toEqual(sessions);
      expect(useSessionStore.getState().loading.get("ws:proj1/ws1")).toBe(false);
    });

    it("sets empty array on failure", async () => {
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useSessionStore.getState().loadForWorkspace("proj1/ws1");

      expect(useSessionStore.getState().sessionsByWorkspace.get("proj1/ws1")).toEqual([]);
      expect(useSessionStore.getState().loading.get("ws:proj1/ws1")).toBe(false);
    });

    it("does not lose data from other workspaces on failure", async () => {
      const existing = new Map<string, SessionInfo[]>();
      existing.set("other/ws", [makeSession({ id: "existing" })]);
      useSessionStore.setState({ sessionsByWorkspace: existing });

      mockRequest.mockRejectedValueOnce(new Error("fail"));
      await useSessionStore.getState().loadForWorkspace("proj1/ws1");

      expect(useSessionStore.getState().sessionsByWorkspace.get("other/ws")).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // loadForProject
  // -----------------------------------------------------------------------

  describe("loadForProject()", () => {
    it("sets loading, calls transport, then stores sessions", async () => {
      const sessions = [makeSession({ id: "s1" })];
      mockRequest.mockResolvedValueOnce(sessions);

      const promise = useSessionStore.getState().loadForProject("proj1");

      expect(useSessionStore.getState().loading.get("project:proj1")).toBe(true);

      await promise;

      expect(mockRequest).toHaveBeenCalledWith("sessions.listByProject", { projectId: "proj1" });
      expect(useSessionStore.getState().sessionsByProject.get("proj1")).toEqual(sessions);
      expect(useSessionStore.getState().loading.get("project:proj1")).toBe(false);
    });

    it("sets empty array on failure", async () => {
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useSessionStore.getState().loadForProject("proj1");

      expect(useSessionStore.getState().sessionsByProject.get("proj1")).toEqual([]);
      expect(useSessionStore.getState().loading.get("project:proj1")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getForWorkspace / getForProject
  // -----------------------------------------------------------------------

  describe("getForWorkspace()", () => {
    it("returns sessions for workspace", () => {
      const sessions = [makeSession()];
      const map = new Map<string, SessionInfo[]>();
      map.set("proj1/ws1", sessions);
      useSessionStore.setState({ sessionsByWorkspace: map });

      expect(useSessionStore.getState().getForWorkspace("proj1/ws1")).toEqual(sessions);
    });

    it("returns empty array if workspace not loaded", () => {
      expect(useSessionStore.getState().getForWorkspace("unknown")).toEqual([]);
    });
  });

  describe("getForProject()", () => {
    it("returns sessions for project", () => {
      const sessions = [makeSession()];
      const map = new Map<string, SessionInfo[]>();
      map.set("proj1", sessions);
      useSessionStore.setState({ sessionsByProject: map });

      expect(useSessionStore.getState().getForProject("proj1")).toEqual(sessions);
    });

    it("returns empty array if project not loaded", () => {
      expect(useSessionStore.getState().getForProject("unknown")).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // isLoading
  // -----------------------------------------------------------------------

  describe("isLoading()", () => {
    it("returns true when loading", () => {
      const loading = new Map<string, boolean>();
      loading.set("ws:proj1/ws1", true);
      useSessionStore.setState({ loading });

      expect(useSessionStore.getState().isLoading("ws:proj1/ws1")).toBe(true);
    });

    it("returns false by default", () => {
      expect(useSessionStore.getState().isLoading("unknown")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // invalidateWorkspace
  // -----------------------------------------------------------------------

  describe("invalidateWorkspace()", () => {
    it("triggers reload by calling loadForWorkspace", async () => {
      const sessions = [makeSession({ id: "refreshed" })];
      mockRequest.mockResolvedValueOnce(sessions);

      useSessionStore.getState().invalidateWorkspace("proj1/ws1");

      // Wait for the async load
      await vi.waitFor(() => {
        expect(useSessionStore.getState().sessionsByWorkspace.get("proj1/ws1")).toEqual(sessions);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Multiple loads don't interfere
  // -----------------------------------------------------------------------

  describe("concurrent loads", () => {
    it("handles loading multiple workspaces simultaneously", async () => {
      const sessions1 = [makeSession({ id: "s1" })];
      const sessions2 = [makeSession({ id: "s2" })];
      mockRequest.mockResolvedValueOnce(sessions1).mockResolvedValueOnce(sessions2);

      await Promise.all([
        useSessionStore.getState().loadForWorkspace("ws1"),
        useSessionStore.getState().loadForWorkspace("ws2"),
      ]);

      expect(useSessionStore.getState().sessionsByWorkspace.get("ws1")).toEqual(sessions1);
      expect(useSessionStore.getState().sessionsByWorkspace.get("ws2")).toEqual(sessions2);
    });
  });
});
