import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Transport mock
// ---------------------------------------------------------------------------

const { mockRequest, mockSubscribe, mockRandomUUID } = vi.hoisted(() => ({
  mockRequest: vi.fn().mockResolvedValue(undefined),
  mockSubscribe: vi.fn(() => vi.fn()),
  mockRandomUUID: vi.fn(() => "test-uuid"),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
  },
}));

vi.stubGlobal("crypto", { randomUUID: mockRandomUUID });

import { useShellStore } from "./shell";
import type { ShellEntry } from "./shell";

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

function makeShell(overrides: Partial<ShellEntry> = {}): ShellEntry {
  return {
    id: "shell-1",
    sessionEntryId: "entry-1",
    workspaceId: "proj1/ws1",
    terminalId: null,
    status: "idle",
    exitCode: null,
    title: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockRandomUUID.mockReturnValue("test-uuid");
  useShellStore.setState({ shells: [], activeId: null });
});

describe("useShellStore", () => {
  // -----------------------------------------------------------------------
  // addShell
  // -----------------------------------------------------------------------

  describe("addShell()", () => {
    it("creates entry with idle status and sets activeId", () => {
      const id = useShellStore.getState().addShell("entry-1", "proj1/ws1");

      expect(id).toBe("test-uuid");

      const { shells, activeId } = useShellStore.getState();
      expect(shells).toHaveLength(1);
      expect(shells[0]).toEqual({
        id: "test-uuid",
        sessionEntryId: "entry-1",
        workspaceId: "proj1/ws1",
        terminalId: null,
        status: "idle",
        exitCode: null,
        title: null,
      });
      expect(activeId).toBe("test-uuid");
    });

    it("returns the generated id", () => {
      mockRandomUUID.mockReturnValue("custom-uuid");
      const id = useShellStore.getState().addShell("entry-1", "proj1/ws1");
      expect(id).toBe("custom-uuid");
    });

    it("appends to existing shells and updates activeId", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "existing" })],
        activeId: "existing",
      });

      mockRandomUUID.mockReturnValue("new-uuid");
      useShellStore.getState().addShell("entry-2", "proj1/ws2");

      const { shells, activeId } = useShellStore.getState();
      expect(shells).toHaveLength(2);
      expect(shells[1]!.id).toBe("new-uuid");
      expect(activeId).toBe("new-uuid");
    });
  });

  // -----------------------------------------------------------------------
  // removeShell
  // -----------------------------------------------------------------------

  describe("removeShell()", () => {
    it("removes the shell from the list", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1" })],
        activeId: "shell-1",
      });

      useShellStore.getState().removeShell("shell-1");

      expect(useShellStore.getState().shells).toHaveLength(0);
    });

    it("calls terminal.destroy if terminalId exists", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1", terminalId: "term-1" })],
        activeId: "shell-1",
      });

      useShellStore.getState().removeShell("shell-1");

      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "term-1" });
    });

    it("does not call terminal.destroy if terminalId is null", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1", terminalId: null })],
        activeId: "shell-1",
      });

      useShellStore.getState().removeShell("shell-1");

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it("updates activeId to adjacent shell when active shell is removed", () => {
      useShellStore.setState({
        shells: [
          makeShell({ id: "shell-1" }),
          makeShell({ id: "shell-2" }),
          makeShell({ id: "shell-3" }),
        ],
        activeId: "shell-2",
      });

      useShellStore.getState().removeShell("shell-2");

      // idx was 1, next array has length 2, min(1, 1) = 1 → shell-3
      expect(useShellStore.getState().activeId).toBe("shell-3");
    });

    it("updates activeId to previous shell when last shell is removed", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1" }), makeShell({ id: "shell-2" })],
        activeId: "shell-2",
      });

      useShellStore.getState().removeShell("shell-2");

      // idx was 1, next array has length 1, min(1, 0) = 0 → shell-1
      expect(useShellStore.getState().activeId).toBe("shell-1");
    });

    it("sets activeId to null when the only shell is removed", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1" })],
        activeId: "shell-1",
      });

      useShellStore.getState().removeShell("shell-1");

      expect(useShellStore.getState().activeId).toBeNull();
    });

    it("preserves activeId when a non-active shell is removed", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1" }), makeShell({ id: "shell-2" })],
        activeId: "shell-1",
      });

      useShellStore.getState().removeShell("shell-2");

      expect(useShellStore.getState().activeId).toBe("shell-1");
    });

    it("no-ops for non-existent id", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1" })],
        activeId: "shell-1",
      });

      useShellStore.getState().removeShell("non-existent");

      expect(useShellStore.getState().shells).toHaveLength(1);
      expect(useShellStore.getState().activeId).toBe("shell-1");
      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // destroyBySessionEntryId
  // -----------------------------------------------------------------------

  describe("destroyBySessionEntryId()", () => {
    it("removes all shells matching the sessionEntryId", () => {
      useShellStore.setState({
        shells: [
          makeShell({ id: "shell-1", sessionEntryId: "entry-1" }),
          makeShell({ id: "shell-2", sessionEntryId: "entry-1" }),
          makeShell({ id: "shell-3", sessionEntryId: "entry-2" }),
        ],
        activeId: "shell-3",
      });

      useShellStore.getState().destroyBySessionEntryId("entry-1");

      const { shells } = useShellStore.getState();
      expect(shells).toHaveLength(1);
      expect(shells[0]!.id).toBe("shell-3");
    });

    it("calls terminal.destroy for each shell with a terminalId", () => {
      useShellStore.setState({
        shells: [
          makeShell({ id: "shell-1", sessionEntryId: "entry-1", terminalId: "term-1" }),
          makeShell({ id: "shell-2", sessionEntryId: "entry-1", terminalId: null }),
          makeShell({ id: "shell-3", sessionEntryId: "entry-1", terminalId: "term-3" }),
        ],
        activeId: "shell-1",
      });

      useShellStore.getState().destroyBySessionEntryId("entry-1");

      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "term-1" });
      expect(mockRequest).toHaveBeenCalledWith("terminal.destroy", { terminalId: "term-3" });
    });

    it("nulls activeId if the active shell was removed", () => {
      useShellStore.setState({
        shells: [
          makeShell({ id: "shell-1", sessionEntryId: "entry-1" }),
          makeShell({ id: "shell-2", sessionEntryId: "entry-2" }),
        ],
        activeId: "shell-1",
      });

      useShellStore.getState().destroyBySessionEntryId("entry-1");

      expect(useShellStore.getState().activeId).toBeNull();
    });

    it("preserves activeId if the active shell was not removed", () => {
      useShellStore.setState({
        shells: [
          makeShell({ id: "shell-1", sessionEntryId: "entry-1" }),
          makeShell({ id: "shell-2", sessionEntryId: "entry-2" }),
        ],
        activeId: "shell-2",
      });

      useShellStore.getState().destroyBySessionEntryId("entry-1");

      expect(useShellStore.getState().activeId).toBe("shell-2");
    });

    it("no-ops for unknown sessionEntryId", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1", sessionEntryId: "entry-1" })],
        activeId: "shell-1",
      });

      useShellStore.getState().destroyBySessionEntryId("unknown");

      expect(useShellStore.getState().shells).toHaveLength(1);
      expect(useShellStore.getState().activeId).toBe("shell-1");
      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateShell
  // -----------------------------------------------------------------------

  describe("updateShell()", () => {
    it("updates partial fields on matching shell", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1", status: "idle" })],
        activeId: "shell-1",
      });

      useShellStore.getState().updateShell("shell-1", {
        status: "active",
        terminalId: "term-1",
        title: "My Shell",
      });

      const shell = useShellStore.getState().shells[0]!;
      expect(shell.status).toBe("active");
      expect(shell.terminalId).toBe("term-1");
      expect(shell.title).toBe("My Shell");
      // Unchanged fields preserved
      expect(shell.sessionEntryId).toBe("entry-1");
      expect(shell.exitCode).toBeNull();
    });

    it("does not affect other shells", () => {
      useShellStore.setState({
        shells: [
          makeShell({ id: "shell-1", status: "idle" }),
          makeShell({ id: "shell-2", status: "idle" }),
        ],
        activeId: "shell-1",
      });

      useShellStore.getState().updateShell("shell-1", { status: "active" });

      expect(useShellStore.getState().shells[1]!.status).toBe("idle");
    });
  });

  // -----------------------------------------------------------------------
  // setActiveId
  // -----------------------------------------------------------------------

  describe("setActiveId()", () => {
    it("sets activeId to a shell id", () => {
      useShellStore.getState().setActiveId("shell-1");
      expect(useShellStore.getState().activeId).toBe("shell-1");
    });

    it("sets activeId to null", () => {
      useShellStore.setState({ activeId: "shell-1", shells: [] });

      useShellStore.getState().setActiveId(null);

      expect(useShellStore.getState().activeId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // terminal:exit subscription
  // -----------------------------------------------------------------------

  describe("terminal:exit subscription", () => {
    function getExitHandler(): (payload: { terminalId: string; exitCode: number }) => void {
      const handler = subscriptionHandlers.get("terminal:exit");
      if (!handler) throw new Error("terminal:exit subscriber not registered");
      return handler as (payload: { terminalId: string; exitCode: number }) => void;
    }

    it("updates matching shell to exited status with exitCode", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1", terminalId: "term-1", status: "active" })],
        activeId: "shell-1",
      });

      getExitHandler()({ terminalId: "term-1", exitCode: 0 });

      const shell = useShellStore.getState().shells[0]!;
      expect(shell.status).toBe("exited");
      expect(shell.exitCode).toBe(0);
    });

    it("handles non-zero exit codes", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1", terminalId: "term-1", status: "active" })],
        activeId: "shell-1",
      });

      getExitHandler()({ terminalId: "term-1", exitCode: 137 });

      const shell = useShellStore.getState().shells[0]!;
      expect(shell.status).toBe("exited");
      expect(shell.exitCode).toBe(137);
    });

    it("no-ops for unknown terminalId", () => {
      useShellStore.setState({
        shells: [makeShell({ id: "shell-1", terminalId: "term-1", status: "active" })],
        activeId: "shell-1",
      });

      getExitHandler()({ terminalId: "unknown", exitCode: 0 });

      const shell = useShellStore.getState().shells[0]!;
      expect(shell.status).toBe("active");
      expect(shell.exitCode).toBeNull();
    });

    it("does not affect other shells", () => {
      useShellStore.setState({
        shells: [
          makeShell({ id: "shell-1", terminalId: "term-1", status: "active" }),
          makeShell({ id: "shell-2", terminalId: "term-2", status: "active" }),
        ],
        activeId: "shell-1",
      });

      getExitHandler()({ terminalId: "term-1", exitCode: 1 });

      expect(useShellStore.getState().shells[0]!.status).toBe("exited");
      expect(useShellStore.getState().shells[1]!.status).toBe("active");
    });
  });
});
