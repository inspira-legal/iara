import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Transport mock
// ---------------------------------------------------------------------------

const { mockRequest, mockSubscribe, mockInvalidateWorkspace } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockSubscribe: vi.fn(() => vi.fn()),
  mockInvalidateWorkspace: vi.fn(),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
  },
}));

vi.mock("./sessions", () => ({
  useSessionStore: {
    getState: () => ({
      invalidateWorkspace: mockInvalidateWorkspace,
    }),
  },
}));

import { useTerminalStore } from "./terminal";
import type { TerminalStatus } from "./terminal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TerminalEntry {
  terminalId: string | null;
  sessionId: string | null;
  status: TerminalStatus;
  exitCode: number | null;
}

const DEFAULT_ENTRY: TerminalEntry = {
  terminalId: null,
  sessionId: null,
  status: "idle",
  exitCode: null,
};

const INITIAL_STATE = {
  entries: new Map<string, TerminalEntry>(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useTerminalStore.setState(INITIAL_STATE);
});

describe("useTerminalStore", () => {
  // -----------------------------------------------------------------------
  // getEntry
  // -----------------------------------------------------------------------

  describe("getEntry()", () => {
    it("returns DEFAULT_ENTRY for unknown workspaceId", () => {
      const entry = useTerminalStore.getState().getEntry("unknown");
      expect(entry).toEqual(DEFAULT_ENTRY);
    });

    it("returns existing entry for known workspaceId", () => {
      const entry: TerminalEntry = {
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
      };
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", entry);
      useTerminalStore.setState({ entries });

      expect(useTerminalStore.getState().getEntry("proj1/ws1")).toEqual(entry);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe("create()", () => {
    it("sets connecting state, calls transport, sets active", async () => {
      mockRequest.mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" });

      const promise = useTerminalStore.getState().create("proj1/ws1");

      // Should be connecting immediately
      expect(useTerminalStore.getState().getEntry("proj1/ws1").status).toBe("connecting");

      await promise;

      expect(mockRequest).toHaveBeenCalledWith("terminal.create", { workspaceId: "proj1/ws1" });
      const entry = useTerminalStore.getState().getEntry("proj1/ws1");
      expect(entry.status).toBe("active");
      expect(entry.terminalId).toBe("term-1");
      expect(entry.sessionId).toBe("sess-1");
    });

    it("invalidates sessions after successful create", async () => {
      mockRequest.mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" });

      await useTerminalStore.getState().create("proj1/ws1");

      expect(mockInvalidateWorkspace).toHaveBeenCalledWith("proj1/ws1");
    });

    it("passes resumeSessionId when provided", async () => {
      mockRequest.mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" });

      await useTerminalStore.getState().create("proj1/ws1", "prev-sess");

      expect(mockRequest).toHaveBeenCalledWith("terminal.create", {
        workspaceId: "proj1/ws1",
        resumeSessionId: "prev-sess",
      });
    });

    it("passes sessionCwd when provided", async () => {
      mockRequest.mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" });

      await useTerminalStore.getState().create("proj1/ws1", undefined, "/some/path");

      expect(mockRequest).toHaveBeenCalledWith("terminal.create", {
        workspaceId: "proj1/ws1",
        sessionCwd: "/some/path",
      });
    });

    it("sets exited state with -1 exit code on error", async () => {
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useTerminalStore.getState().create("proj1/ws1");

      const entry = useTerminalStore.getState().getEntry("proj1/ws1");
      expect(entry.status).toBe("exited");
      expect(entry.exitCode).toBe(-1);
    });
  });

  // -----------------------------------------------------------------------
  // restart
  // -----------------------------------------------------------------------

  describe("restart()", () => {
    it("destroys old terminal and creates new with previous sessionId", async () => {
      // Set up existing entry
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "old-term",
        sessionId: "old-sess",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      mockRequest
        .mockResolvedValueOnce(undefined) // terminal.destroy
        .mockResolvedValueOnce({ terminalId: "new-term", sessionId: "new-sess" }); // terminal.create

      await useTerminalStore.getState().restart("proj1/ws1");

      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "old-term" });
      expect(mockRequest).toHaveBeenCalledWith("terminal.create", {
        workspaceId: "proj1/ws1",
        resumeSessionId: "old-sess",
      });
    });

    it("skips destroy if no terminalId exists", async () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: null,
        sessionId: "old-sess",
        status: "exited",
        exitCode: 1,
      });
      useTerminalStore.setState({ entries });

      mockRequest.mockResolvedValueOnce({ terminalId: "new-term", sessionId: "new-sess" });

      await useTerminalStore.getState().restart("proj1/ws1");

      // Should NOT have called terminal.destroy
      expect(mockRequest).not.toHaveBeenCalledWith("terminal.destroy", expect.anything());
      expect(mockRequest).toHaveBeenCalledWith(
        "terminal.create",
        expect.objectContaining({
          workspaceId: "proj1/ws1",
        }),
      );
    });

    it("ignores destroy errors and still creates new terminal", async () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "old-term",
        sessionId: "old-sess",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      mockRequest
        .mockRejectedValueOnce(new Error("destroy failed")) // terminal.destroy
        .mockResolvedValueOnce({ terminalId: "new-term", sessionId: "new-sess" }); // terminal.create

      await useTerminalStore.getState().restart("proj1/ws1");

      const entry = useTerminalStore.getState().getEntry("proj1/ws1");
      expect(entry.status).toBe("active");
      expect(entry.terminalId).toBe("new-term");
    });
  });

  // -----------------------------------------------------------------------
  // destroy
  // -----------------------------------------------------------------------

  describe("destroy()", () => {
    it("calls transport.destroy and removes entry", async () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      mockRequest.mockResolvedValueOnce(undefined);

      await useTerminalStore.getState().destroy("proj1/ws1");

      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "term-1" });
      expect(useTerminalStore.getState().entries.has("proj1/ws1")).toBe(false);
    });

    it("removes entry even if destroy fails", async () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useTerminalStore.getState().destroy("proj1/ws1");

      expect(useTerminalStore.getState().entries.has("proj1/ws1")).toBe(false);
    });

    it("does nothing for entries without terminalId", async () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", { ...DEFAULT_ENTRY });
      useTerminalStore.setState({ entries });

      await useTerminalStore.getState().destroy("proj1/ws1");

      expect(mockRequest).not.toHaveBeenCalled();
      expect(useTerminalStore.getState().entries.has("proj1/ws1")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // resetToSessions
  // -----------------------------------------------------------------------

  describe("resetToSessions()", () => {
    it("destroys terminal, removes entry, and invalidates sessions", () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      mockRequest.mockResolvedValueOnce(undefined);

      useTerminalStore.getState().resetToSessions("proj1/ws1");

      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "term-1" });
      expect(useTerminalStore.getState().entries.has("proj1/ws1")).toBe(false);
      expect(mockInvalidateWorkspace).toHaveBeenCalledWith("proj1/ws1");
    });

    it("skips destroy call if no terminalId", () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", { ...DEFAULT_ENTRY });
      useTerminalStore.setState({ entries });

      useTerminalStore.getState().resetToSessions("proj1/ws1");

      expect(mockRequest).not.toHaveBeenCalled();
      expect(mockInvalidateWorkspace).toHaveBeenCalledWith("proj1/ws1");
    });
  });

  // -----------------------------------------------------------------------
  // handleExit
  // -----------------------------------------------------------------------

  describe("handleExit()", () => {
    it("exit code 0 removes entry and invalidates sessions", () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      useTerminalStore.getState().handleExit("term-1", 0);

      expect(useTerminalStore.getState().entries.has("proj1/ws1")).toBe(false);
      expect(mockInvalidateWorkspace).toHaveBeenCalledWith("proj1/ws1");
    });

    it("non-zero exit code sets exited state", () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      useTerminalStore.getState().handleExit("term-1", 1);

      const entry = useTerminalStore.getState().getEntry("proj1/ws1");
      expect(entry.status).toBe("exited");
      expect(entry.exitCode).toBe(1);
      expect(entry.terminalId).toBeNull();
    });

    it("does nothing if terminalId not found", () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      useTerminalStore.getState().handleExit("unknown-term", 0);

      // Entry unchanged
      expect(useTerminalStore.getState().getEntry("proj1/ws1").status).toBe("active");
    });

    it("preserves sessionId on non-zero exit", () => {
      const entries = new Map<string, TerminalEntry>();
      entries.set("proj1/ws1", {
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
      });
      useTerminalStore.setState({ entries });

      useTerminalStore.getState().handleExit("term-1", 137);

      const entry = useTerminalStore.getState().getEntry("proj1/ws1");
      expect(entry.sessionId).toBe("sess-1");
      expect(entry.exitCode).toBe(137);
    });
  });
});
