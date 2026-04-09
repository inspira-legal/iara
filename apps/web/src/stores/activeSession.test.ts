import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Transport mock
// ---------------------------------------------------------------------------

const { mockRequest, mockSubscribe, mockRefreshSessions, mockRandomUUID } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockSubscribe: vi.fn(() => vi.fn()),
  mockRefreshSessions: vi.fn().mockResolvedValue(undefined),
  mockRandomUUID: vi.fn(() => "test-uuid"),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
  },
}));

vi.mock("./app", () => ({
  useAppStore: {
    getState: () => ({
      refreshSessions: mockRefreshSessions,
    }),
  },
}));

// Mock crypto.randomUUID
vi.stubGlobal("crypto", { randomUUID: mockRandomUUID });

import { useActiveSessionStore } from "./activeSession";
import type { ActiveSessionEntry } from "./activeSession";

// ---------------------------------------------------------------------------
// Capture module-level subscription handlers (registered at import time)
// ---------------------------------------------------------------------------

const subscriptionHandlers = new Map<string, (...args: unknown[]) => void>();
for (const call of mockSubscribe.mock.calls) {
  const [event, handler] = call as unknown as [string, (...args: unknown[]) => void];
  subscriptionHandlers.set(event, handler);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_ENTRY: ActiveSessionEntry = {
  id: "",
  workspaceId: "",
  terminalId: null,
  sessionId: null,
  status: "idle",
  exitCode: null,
  errorCode: null,
  hasData: false,
  initialPrompt: null,
  title: null,
  isResume: false,
};

const INITIAL_STATE = {
  entries: new Map<string, ActiveSessionEntry>(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockRandomUUID.mockReturnValue("test-uuid");
  useActiveSessionStore.setState(INITIAL_STATE);
});

describe("useActiveSessionStore", () => {
  // -----------------------------------------------------------------------
  // getEntry
  // -----------------------------------------------------------------------

  describe("getEntry()", () => {
    it("returns DEFAULT_ENTRY for unknown id", () => {
      const entry = useActiveSessionStore.getState().getEntry("unknown");
      expect(entry).toEqual(DEFAULT_ENTRY);
    });

    it("returns existing entry for known id", () => {
      const entry: ActiveSessionEntry = {
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        exitCode: null,
        errorCode: null,
        hasData: false,
        initialPrompt: null,
        title: null,
        isResume: false,
      };
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", entry);
      useActiveSessionStore.setState({ entries });

      expect(useActiveSessionStore.getState().getEntry("entry-1")).toEqual(entry);
    });
  });

  // -----------------------------------------------------------------------
  // orderedEntries
  // -----------------------------------------------------------------------

  describe("orderedEntries()", () => {
    it("returns empty array when no entries", () => {
      expect(useActiveSessionStore.getState().orderedEntries()).toEqual([]);
    });

    it("returns entries in insertion order", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      const entry1: ActiveSessionEntry = {
        ...DEFAULT_ENTRY,
        id: "id-1",
        workspaceId: "proj1/ws1",
        status: "active",
      };
      const entry2: ActiveSessionEntry = {
        ...DEFAULT_ENTRY,
        id: "id-2",
        workspaceId: "proj1/ws2",
        status: "connecting",
      };
      entries.set("id-1", entry1);
      entries.set("id-2", entry2);
      useActiveSessionStore.setState({ entries });

      const ordered = useActiveSessionStore.getState().orderedEntries();
      expect(ordered).toEqual([entry1, entry2]);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe("create()", () => {
    it("sets connecting state, calls transport, sets active, returns id", async () => {
      mockRequest
        .mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" })
        .mockResolvedValueOnce([]); // sessions.list

      const promise = useActiveSessionStore.getState().create("proj1/ws1");

      // Should be connecting immediately
      expect(useActiveSessionStore.getState().getEntry("test-uuid").status).toBe("connecting");

      const id = await promise;

      expect(id).toBe("test-uuid");
      expect(mockRequest).toHaveBeenCalledWith("terminal.create", { workspaceId: "proj1/ws1" });
      const entry = useActiveSessionStore.getState().getEntry("test-uuid");
      expect(entry.status).toBe("active");
      expect(entry.terminalId).toBe("term-1");
      expect(entry.sessionId).toBe("sess-1");
      expect(entry.workspaceId).toBe("proj1/ws1");
    });

    it("invalidates sessions after successful create", async () => {
      mockRequest
        .mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" })
        .mockResolvedValueOnce([]); // sessions.list

      await useActiveSessionStore.getState().create("proj1/ws1");

      expect(mockRefreshSessions).toHaveBeenCalledWith("proj1/ws1");
    });

    it("passes resumeSessionId when provided", async () => {
      mockRequest
        .mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" })
        .mockResolvedValueOnce([]); // sessions.list

      await useActiveSessionStore.getState().create("proj1/ws1", {
        resumeSessionId: "prev-sess",
      });

      expect(mockRequest).toHaveBeenCalledWith("terminal.create", {
        workspaceId: "proj1/ws1",
        resumeSessionId: "prev-sess",
      });
    });

    it("passes sessionCwd when provided", async () => {
      mockRequest
        .mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" })
        .mockResolvedValueOnce([]); // sessions.list

      await useActiveSessionStore.getState().create("proj1/ws1", { sessionCwd: "/some/path" });

      expect(mockRequest).toHaveBeenCalledWith("terminal.create", {
        workspaceId: "proj1/ws1",
        sessionCwd: "/some/path",
      });
    });

    it("passes initialPrompt when provided", async () => {
      mockRequest
        .mockResolvedValueOnce({ terminalId: "term-1", sessionId: "sess-1" })
        .mockResolvedValueOnce([]); // sessions.list

      await useActiveSessionStore.getState().create("proj1/ws1", {
        initialPrompt: "hello world",
      });

      expect(mockRequest).toHaveBeenCalledWith("terminal.create", {
        workspaceId: "proj1/ws1",
        initialPrompt: "hello world",
      });
      const entry = useActiveSessionStore.getState().getEntry("test-uuid");
      expect(entry.initialPrompt).toBe("hello world");
    });

    it("sets exited state with -1 exit code on error", async () => {
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useActiveSessionStore.getState().create("proj1/ws1");

      const entry = useActiveSessionStore.getState().getEntry("test-uuid");
      expect(entry.status).toBe("exited");
      expect(entry.exitCode).toBe(-1);
    });
  });

  // -----------------------------------------------------------------------
  // restart
  // -----------------------------------------------------------------------

  describe("restart()", () => {
    it("destroys old terminal and creates new with previous sessionId", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "old-term",
        sessionId: "old-sess",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      mockRequest
        .mockResolvedValueOnce(undefined) // terminal.destroy
        .mockResolvedValueOnce({ terminalId: "new-term", sessionId: "new-sess" }) // terminal.create
        .mockResolvedValueOnce([]); // sessions.list

      mockRandomUUID.mockReturnValue("new-uuid");

      await useActiveSessionStore.getState().restart("entry-1");

      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "old-term" });
      expect(mockRequest).toHaveBeenCalledWith("terminal.create", {
        workspaceId: "proj1/ws1",
        resumeSessionId: "old-sess",
      });
    });

    it("skips destroy if no terminalId exists", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        sessionId: "old-sess",
        status: "exited",
        exitCode: 1,
      });
      useActiveSessionStore.setState({ entries });

      mockRequest
        .mockResolvedValueOnce({ terminalId: "new-term", sessionId: "new-sess" }) // terminal.create
        .mockResolvedValueOnce([]); // sessions.list
      mockRandomUUID.mockReturnValue("new-uuid");

      await useActiveSessionStore.getState().restart("entry-1");

      expect(mockRequest).not.toHaveBeenCalledWith("terminal.destroy", expect.anything());
      expect(mockRequest).toHaveBeenCalledWith(
        "terminal.create",
        expect.objectContaining({
          workspaceId: "proj1/ws1",
        }),
      );
    });

    it("ignores destroy errors and still creates new terminal", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "old-term",
        sessionId: "old-sess",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      mockRequest
        .mockRejectedValueOnce(new Error("destroy failed")) // terminal.destroy
        .mockResolvedValueOnce({ terminalId: "new-term", sessionId: "new-sess" }) // terminal.create
        .mockResolvedValueOnce([]); // sessions.list

      mockRandomUUID.mockReturnValue("new-uuid");

      await useActiveSessionStore.getState().restart("entry-1");

      const entry = useActiveSessionStore.getState().getEntry("new-uuid");
      expect(entry.status).toBe("active");
      expect(entry.terminalId).toBe("new-term");
    });
  });

  // -----------------------------------------------------------------------
  // destroy
  // -----------------------------------------------------------------------

  describe("destroy()", () => {
    it("calls transport.destroy and removes entry", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      mockRequest.mockResolvedValueOnce(undefined);

      await useActiveSessionStore.getState().destroy("entry-1");

      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "term-1" });
      expect(useActiveSessionStore.getState().entries.has("entry-1")).toBe(false);
    });

    it("removes entry even if destroy fails", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useActiveSessionStore.getState().destroy("entry-1");

      expect(useActiveSessionStore.getState().entries.has("entry-1")).toBe(false);
    });

    it("does nothing for entries without terminalId", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", { ...DEFAULT_ENTRY, id: "entry-1", workspaceId: "proj1/ws1" });
      useActiveSessionStore.setState({ entries });

      await useActiveSessionStore.getState().destroy("entry-1");

      // No terminal.destroy call, but cleanup calls scripts.stopAll for workspace
      expect(mockRequest).not.toHaveBeenCalledWith("terminal.destroy", expect.anything());
      expect(useActiveSessionStore.getState().entries.has("entry-1")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // resetToSessions
  // -----------------------------------------------------------------------

  describe("resetToSessions()", () => {
    it("destroys terminal, removes entry, and invalidates sessions", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      mockRequest.mockResolvedValueOnce(undefined);

      useActiveSessionStore.getState().resetToSessions("entry-1");

      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "term-1" });
      expect(useActiveSessionStore.getState().entries.has("entry-1")).toBe(false);
      expect(mockRefreshSessions).toHaveBeenCalledWith("proj1/ws1");
    });

    it("skips destroy call if no terminalId", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", { ...DEFAULT_ENTRY, id: "entry-1", workspaceId: "proj1/ws1" });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().resetToSessions("entry-1");

      expect(mockRequest).not.toHaveBeenCalled();
      expect(mockRefreshSessions).toHaveBeenCalledWith("proj1/ws1");
    });
  });

  // -----------------------------------------------------------------------
  // handleExit
  // -----------------------------------------------------------------------

  describe("handleExit()", () => {
    it("exit code 0 removes entry and invalidates sessions", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().handleExit("term-1", 0);

      expect(useActiveSessionStore.getState().entries.has("entry-1")).toBe(false);
      expect(mockRefreshSessions).toHaveBeenCalledWith("proj1/ws1");
    });

    it("non-zero exit code sets exited state", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().handleExit("term-1", 1);

      const entry = useActiveSessionStore.getState().getEntry("entry-1");
      expect(entry.status).toBe("exited");
      expect(entry.exitCode).toBe(1);
      expect(entry.terminalId).toBeNull();
    });

    it("does nothing if terminalId not found", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().handleExit("unknown-term", 0);

      expect(useActiveSessionStore.getState().getEntry("entry-1").status).toBe("active");
    });

    it("preserves sessionId on non-zero exit", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().handleExit("term-1", 137);

      const entry = useActiveSessionStore.getState().getEntry("entry-1");
      expect(entry.sessionId).toBe("sess-1");
      expect(entry.exitCode).toBe(137);
    });
  });

  // -----------------------------------------------------------------------
  // updateTitle
  // -----------------------------------------------------------------------

  describe("updateTitle()", () => {
    it("updates title for matching sessionId", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().updateTitle("sess-1", "My Title");

      expect(useActiveSessionStore.getState().getEntry("entry-1").title).toBe("My Title");
    });

    it("does nothing if sessionId not found", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().updateTitle("unknown-sess", "My Title");

      expect(useActiveSessionStore.getState().getEntry("entry-1").title).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // terminal:data subscription
  // -----------------------------------------------------------------------

  describe("terminal:data subscription", () => {
    function getDataHandler(): (payload: { terminalId: string }) => void {
      const handler = subscriptionHandlers.get("terminal:data");
      if (!handler) throw new Error("terminal:data subscriber not registered");
      return handler as (payload: { terminalId: string }) => void;
    }

    it("sets hasData to true on first data event", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      getDataHandler()({ terminalId: "term-1" });

      expect(useActiveSessionStore.getState().getEntry("entry-1").hasData).toBe(true);
    });

    it("is a no-op when hasData is already true", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      const entry: ActiveSessionEntry = {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        hasData: true,
      };
      entries.set("entry-1", entry);
      useActiveSessionStore.setState({ entries });

      getDataHandler()({ terminalId: "term-1" });

      expect(useActiveSessionStore.getState().entries.get("entry-1")).toBe(entry);
    });

    it("is a no-op for unknown terminalId", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });
      const before = useActiveSessionStore.getState().entries;

      getDataHandler()({ terminalId: "unknown" });

      expect(useActiveSessionStore.getState().entries).toBe(before);
    });

    it("does not affect other entries", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      entries.set("entry-2", {
        ...DEFAULT_ENTRY,
        id: "entry-2",
        workspaceId: "proj1/ws2",
        terminalId: "term-2",
        sessionId: "sess-2",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      getDataHandler()({ terminalId: "term-1" });

      expect(useActiveSessionStore.getState().getEntry("entry-1").hasData).toBe(true);
      expect(useActiveSessionStore.getState().getEntry("entry-2").hasData).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // create resets hasData
  // -----------------------------------------------------------------------

  describe("create() hasData lifecycle", () => {
    it("sets hasData to false on create", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("old-entry", {
        ...DEFAULT_ENTRY,
        id: "old-entry",
        workspaceId: "proj1/ws1",
        terminalId: "old-term",
        sessionId: "old-sess",
        status: "active",
        hasData: true,
      });
      useActiveSessionStore.setState({ entries });

      mockRequest
        .mockResolvedValueOnce({ terminalId: "new-term", sessionId: "new-sess" })
        .mockResolvedValueOnce([]); // sessions.list
      const id = await useActiveSessionStore.getState().create("proj1/ws1");

      expect(useActiveSessionStore.getState().getEntry(id).hasData).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // create error handling
  // -----------------------------------------------------------------------

  describe("create() error handling", () => {
    it("sets CLAUDE_NOT_AVAILABLE errorCode when error has matching code", async () => {
      const err = new Error("not available") as Error & { code: string };
      err.code = "CLAUDE_NOT_AVAILABLE";
      mockRequest.mockRejectedValueOnce(err);

      await useActiveSessionStore.getState().create("proj1/ws1");

      const entry = useActiveSessionStore.getState().getEntry("test-uuid");
      expect(entry.status).toBe("exited");
      expect(entry.errorCode).toBe("CLAUDE_NOT_AVAILABLE");
    });

    it("sets null errorCode for generic errors", async () => {
      mockRequest.mockRejectedValueOnce(new Error("generic fail"));

      await useActiveSessionStore.getState().create("proj1/ws1");

      const entry = useActiveSessionStore.getState().getEntry("test-uuid");
      expect(entry.errorCode).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // handleExit with isResume (failed resume retry)
  // -----------------------------------------------------------------------

  describe("handleExit() with failed resume", () => {
    it("retries as fresh session when resume fails with non-zero exit", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        isResume: true,
      });
      useActiveSessionStore.setState({ entries });

      // The retry create() will call terminal.create + sessions.list
      mockRandomUUID.mockReturnValue("retry-uuid");
      mockRequest
        .mockResolvedValueOnce({ terminalId: "new-term", sessionId: "new-sess" })
        .mockResolvedValueOnce([]); // sessions.list

      useActiveSessionStore.getState().handleExit("term-1", 1);

      // Original entry should be removed
      expect(useActiveSessionStore.getState().entries.has("entry-1")).toBe(false);

      // Wait for the async create() triggered by handleExit
      await vi.waitFor(() => {
        expect(useActiveSessionStore.getState().entries.has("retry-uuid")).toBe(true);
      });
    });

    it("does not retry when isResume is false", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        isResume: false,
      });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().handleExit("term-1", 1);

      // Should set exited state, not retry
      const entry = useActiveSessionStore.getState().getEntry("entry-1");
      expect(entry.status).toBe("exited");
      expect(entry.exitCode).toBe(1);
    });

    it("does not retry when exit code is 0 even if isResume", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
        isResume: true,
      });
      useActiveSessionStore.setState({ entries });

      useActiveSessionStore.getState().handleExit("term-1", 0);

      // Exit code 0 removes entry normally
      expect(useActiveSessionStore.getState().entries.has("entry-1")).toBe(false);
      expect(mockRefreshSessions).toHaveBeenCalledWith("proj1/ws1");
    });
  });

  // -----------------------------------------------------------------------
  // renameSession
  // -----------------------------------------------------------------------

  describe("renameSession()", () => {
    it("calls sessions.rename and updates title", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      mockRequest.mockResolvedValueOnce(undefined); // sessions.rename

      await useActiveSessionStore.getState().renameSession("entry-1", "New Title");

      expect(mockRequest).toHaveBeenCalledWith("sessions.rename", {
        workspaceId: "proj1/ws1",
        sessionId: "sess-1",
        title: "New Title",
      });
      expect(useActiveSessionStore.getState().getEntry("entry-1").title).toBe("New Title");
    });

    it("does nothing if entry has no sessionId", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
      });
      useActiveSessionStore.setState({ entries });

      await useActiveSessionStore.getState().renameSession("entry-1", "New Title");

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it("does nothing for unknown entryId", async () => {
      await useActiveSessionStore.getState().renameSession("unknown", "New Title");
      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // session:updated subscription
  // -----------------------------------------------------------------------

  describe("session:updated subscription", () => {
    function getUpdatedHandler(): (payload: { terminalId: string; sessionId: string }) => void {
      const handler = subscriptionHandlers.get("session:updated");
      if (!handler) throw new Error("session:updated subscriber not registered");
      return handler as (payload: { terminalId: string; sessionId: string }) => void;
    }

    it("updates sessionId when terminal matches and sessionId differs", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "old-sess",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      getUpdatedHandler()({ terminalId: "term-1", sessionId: "new-sess" });

      expect(useActiveSessionStore.getState().getEntry("entry-1").sessionId).toBe("new-sess");
    });

    it("does not update when sessionId is already the same", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      const entry: ActiveSessionEntry = {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "same-sess",
        status: "active",
      };
      entries.set("entry-1", entry);
      useActiveSessionStore.setState({ entries });

      getUpdatedHandler()({ terminalId: "term-1", sessionId: "same-sess" });

      // Should return same state reference (no mutation)
      expect(useActiveSessionStore.getState().entries.get("entry-1")).toBe(entry);
    });

    it("does nothing for unknown terminalId", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });
      const before = useActiveSessionStore.getState().entries;

      getUpdatedHandler()({ terminalId: "unknown", sessionId: "new-sess" });

      expect(useActiveSessionStore.getState().entries).toBe(before);
    });
  });

  // -----------------------------------------------------------------------
  // session:changed subscription
  // -----------------------------------------------------------------------

  describe("session:changed subscription", () => {
    function getChangedHandler(): (payload: { workspaceId: string }) => void {
      const handler = subscriptionHandlers.get("session:changed");
      if (!handler) throw new Error("session:changed subscriber not registered");
      return handler as (payload: { workspaceId: string }) => void;
    }

    it("fetches sessions and updates titles for matching workspace", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      mockRequest.mockResolvedValueOnce([{ id: "sess-1", title: "Updated Title" }]);

      getChangedHandler()({ workspaceId: "proj1/ws1" });

      await vi.waitFor(() => {
        expect(useActiveSessionStore.getState().getEntry("entry-1").title).toBe("Updated Title");
      });
    });

    it("does not fetch sessions if no active entries for workspace", () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      getChangedHandler()({ workspaceId: "proj1/ws2" }); // different workspace

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it("skips sessions without title", async () => {
      const entries = new Map<string, ActiveSessionEntry>();
      entries.set("entry-1", {
        ...DEFAULT_ENTRY,
        id: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: "term-1",
        sessionId: "sess-1",
        status: "active",
      });
      useActiveSessionStore.setState({ entries });

      mockRequest.mockResolvedValueOnce([{ id: "sess-1", title: null }]);

      getChangedHandler()({ workspaceId: "proj1/ws1" });

      await vi.waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith("sessions.list", { workspaceId: "proj1/ws1" });
      });

      // Title should remain null since the session has no title
      expect(useActiveSessionStore.getState().getEntry("entry-1").title).toBeNull();
    });
  });
});
