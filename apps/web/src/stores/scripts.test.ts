import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ScriptsConfig, ScriptStatus } from "@iara/contracts";

// ---------------------------------------------------------------------------
// Transport mock
// ---------------------------------------------------------------------------

const { mockRequest, mockSubscribe } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockSubscribe: vi.fn((_event: string, _cb: (...args: unknown[]) => void) => vi.fn()),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
  },
}));

import { useScriptsStore, useIsDiscovering, useDiscoveryError } from "./scripts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScriptStatus(overrides: Partial<ScriptStatus> = {}): ScriptStatus {
  return {
    scriptId: "8080:api:dev",
    projectId: "proj1",
    workspace: "ws1",
    service: "api",
    script: "dev",
    pid: null,
    health: "stopped",
    exitCode: null,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ScriptsConfig> = {}): ScriptsConfig {
  return {
    services: [],
    statuses: [],
    hasFile: true,
    filePath: "/tmp/scripts.yaml",
    ...overrides,
  };
}

const INITIAL_STATE = {
  config: null,
  currentWorkspaceId: null,
  loading: false,
  discoveringProjects: new Set<string>(),
  discoveryErrors: new Map<string, string>(),
  pendingStatuses: [] as ScriptStatus[],
  logs: new Map<string, string[]>(),
  selectedLog: null,
  activeTab: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useScriptsStore.setState(INITIAL_STATE);
});

describe("useScriptsStore", () => {
  // -----------------------------------------------------------------------
  // loadConfig
  // -----------------------------------------------------------------------

  describe("loadConfig()", () => {
    it("sets loading, currentWorkspaceId, resets config, and clears loading", async () => {
      await useScriptsStore.getState().loadConfig("proj1/ws1");

      // loadConfig no longer calls transport — config comes from app store via state:patch
      expect(mockRequest).not.toHaveBeenCalled();
      expect(useScriptsStore.getState().currentWorkspaceId).toBe("proj1/ws1");
      expect(useScriptsStore.getState().selectedLog).toBeNull();
      expect(useScriptsStore.getState().activeTab).toBe("scripts");
      expect(useScriptsStore.getState().config).toBeNull();
      expect(useScriptsStore.getState().loading).toBe(false);
    });

    it("resets selectedLog but preserves activeTab when loading new workspace", async () => {
      useScriptsStore.setState({
        selectedLog: { service: "api", script: "dev" },
        activeTab: "output",
      });

      await useScriptsStore.getState().loadConfig("proj1/ws2");

      expect(useScriptsStore.getState().selectedLog).toBeNull();
      expect(useScriptsStore.getState().activeTab).toBe("output");
    });
  });

  // -----------------------------------------------------------------------
  // runScript / stopScript
  // -----------------------------------------------------------------------

  describe("runScript()", () => {
    it("calls transport with correct params", async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await useScriptsStore.getState().runScript("proj1/ws1", "api", "dev");

      expect(mockRequest).toHaveBeenCalledWith("scripts.run", {
        workspaceId: "proj1/ws1",
        service: "api",
        script: "dev",
      });
    });
  });

  describe("stopScript()", () => {
    it("calls transport with scriptId", async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await useScriptsStore.getState().stopScript("8080:api:dev");

      expect(mockRequest).toHaveBeenCalledWith("scripts.stop", { scriptId: "8080:api:dev" });
    });
  });

  // -----------------------------------------------------------------------
  // runAll / stopAll
  // -----------------------------------------------------------------------

  describe("runAll()", () => {
    it("calls transport with workspaceId and category", async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await useScriptsStore.getState().runAll("proj1/ws1", "dev");

      expect(mockRequest).toHaveBeenCalledWith("scripts.runAll", {
        workspaceId: "proj1/ws1",
        category: "dev",
      });
    });
  });

  describe("stopAll()", () => {
    it("calls transport with workspaceId", async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await useScriptsStore.getState().stopAll("proj1/ws1");

      expect(mockRequest).toHaveBeenCalledWith("scripts.stopAll", { workspaceId: "proj1/ws1" });
    });
  });

  // -----------------------------------------------------------------------
  // selectLog
  // -----------------------------------------------------------------------

  describe("selectLog()", () => {
    it("sets selected log", () => {
      useScriptsStore.getState().selectLog("api", "dev");

      expect(useScriptsStore.getState().selectedLog).toEqual({ service: "api", script: "dev" });
    });

    it("auto-fetches logs if not loaded and status exists", () => {
      const status = makeScriptStatus({ service: "api", script: "dev", scriptId: "8080:api:dev" });
      const config = makeConfig({ statuses: [status] });
      useScriptsStore.setState({ config });
      mockRequest.mockResolvedValueOnce(["line1", "line2"]);

      useScriptsStore.getState().selectLog("api", "dev");

      expect(mockRequest).toHaveBeenCalledWith("scripts.logs", {
        scriptId: "8080:api:dev",
        limit: 200,
      });
    });

    it("does not fetch logs if already loaded", () => {
      const status = makeScriptStatus({ service: "api", script: "dev", scriptId: "8080:api:dev" });
      const config = makeConfig({ statuses: [status] });
      const logs = new Map<string, string[]>();
      logs.set("8080:api:dev", ["existing-line"]);
      useScriptsStore.setState({ config, logs });

      useScriptsStore.getState().selectLog("api", "dev");

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it("does not fetch logs if no config", () => {
      useScriptsStore.setState({ config: null });

      useScriptsStore.getState().selectLog("api", "dev");

      expect(mockRequest).not.toHaveBeenCalled();
    });

    it("does not fetch logs if status not found", () => {
      const config = makeConfig({ statuses: [] });
      useScriptsStore.setState({ config });

      useScriptsStore.getState().selectLog("api", "dev");

      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // setActiveTab / syncCollapsed
  // -----------------------------------------------------------------------

  describe("setActiveTab()", () => {
    it("sets active tab", () => {
      useScriptsStore.getState().setActiveTab("output");
      expect(useScriptsStore.getState().activeTab).toBe("output");
    });
  });

  describe("syncCollapsed()", () => {
    it("clears activeTab when collapsing", () => {
      useScriptsStore.setState({ activeTab: "scripts" });
      useScriptsStore.getState().syncCollapsed(true);
      expect(useScriptsStore.getState().activeTab).toBeNull();
    });

    it("sets activeTab to scripts when expanding with no tab", () => {
      useScriptsStore.setState({ activeTab: null });
      useScriptsStore.getState().syncCollapsed(false);
      expect(useScriptsStore.getState().activeTab).toBe("scripts");
    });

    it("does not change activeTab when expanding with existing tab", () => {
      useScriptsStore.setState({ activeTab: "output" });
      useScriptsStore.getState().syncCollapsed(false);
      expect(useScriptsStore.getState().activeTab).toBe("output");
    });

    it("initial activeTab is null (collapsed)", () => {
      expect(useScriptsStore.getState().activeTab).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // discover
  // -----------------------------------------------------------------------

  describe("discover()", () => {
    it("sets discovering, calls transport", async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      const promise = useScriptsStore.getState().discover("proj1");

      await promise;

      expect(mockRequest).toHaveBeenCalledWith("scripts.discover", { projectId: "proj1" });
    });

    it("clears discovering on error", async () => {
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useScriptsStore.getState().discover("proj1");

      expect(useScriptsStore.getState().discoveringProjects.has("proj1")).toBe(false);
    });

    it("sets discoveryError with Error message on failure", async () => {
      mockRequest.mockRejectedValueOnce(new Error("discovery failed"));

      await useScriptsStore.getState().discover("proj1");

      expect(useScriptsStore.getState().discoveryErrors.get("proj1")).toBe("discovery failed");
    });

    it("sets discoveryError with string coercion for non-Error rejection", async () => {
      mockRequest.mockRejectedValueOnce("string error");

      await useScriptsStore.getState().discover("proj1");

      expect(useScriptsStore.getState().discoveryErrors.get("proj1")).toBe("string error");
    });

    it("clears previous discoveryError when re-discovering", async () => {
      useScriptsStore.setState({
        discoveryErrors: new Map([["proj1", "old error"]]),
      });
      mockRequest.mockResolvedValueOnce(undefined);

      await useScriptsStore.getState().discover("proj1");

      expect(useScriptsStore.getState().discoveryErrors.has("proj1")).toBe(false);
    });

    it("clears config, logs, and selectedLog when discovering current project", async () => {
      const config = makeConfig({ statuses: [makeScriptStatus()] });
      const logs = new Map<string, string[]>();
      logs.set("8080:api:dev", ["line1"]);
      useScriptsStore.setState({
        config,
        logs,
        selectedLog: { service: "api", script: "dev" },
        currentWorkspaceId: "proj1/ws1",
      });
      mockRequest.mockResolvedValueOnce(undefined);

      await useScriptsStore.getState().discover("proj1");

      expect(useScriptsStore.getState().config).toBeNull();
      expect(useScriptsStore.getState().logs.size).toBe(0);
      expect(useScriptsStore.getState().selectedLog).toBeNull();
    });

    it("does not clear config when discovering a different project", async () => {
      const config = makeConfig({ statuses: [makeScriptStatus()] });
      useScriptsStore.setState({ config, currentWorkspaceId: "proj1/ws1" });
      mockRequest.mockResolvedValueOnce(undefined);

      await useScriptsStore.getState().discover("proj2");

      expect(useScriptsStore.getState().config).toEqual(config);
    });
  });

  // -----------------------------------------------------------------------
  // subscribePush
  // -----------------------------------------------------------------------

  describe("subscribePush()", () => {
    it("subscribes to two events and returns unsubscribe", () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      mockSubscribe.mockReturnValueOnce(unsub1).mockReturnValueOnce(unsub2);

      const unsubAll = useScriptsStore.getState().subscribePush();

      expect(mockSubscribe).toHaveBeenCalledWith("scripts:log", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("scripts:discovering", expect.any(Function));
      expect(mockSubscribe).not.toHaveBeenCalledWith("scripts:status", expect.any(Function));
      expect(mockSubscribe).not.toHaveBeenCalledWith("scripts:reload", expect.any(Function));

      unsubAll();
      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
    });

    it("scripts:log appends log line", () => {
      const logs = new Map<string, string[]>();
      logs.set("8080:api:dev", ["line1"]);
      useScriptsStore.setState({ logs });

      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:log") {
          cb({ scriptId: "8080:api:dev", service: "api", script: "dev", line: "line2" });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      expect(useScriptsStore.getState().logs.get("8080:api:dev")).toEqual(["line1", "line2"]);
    });

    it("scripts:log creates new log entry if none exists", () => {
      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:log") {
          cb({ scriptId: "new-script", service: "api", script: "dev", line: "first line" });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      expect(useScriptsStore.getState().logs.get("new-script")).toEqual(["first line"]);
    });

    it("scripts:log caps at MAX_LOG_LINES (1000)", () => {
      const existingLines = Array.from({ length: 1000 }, (_, i) => `line-${i}`);
      const logs = new Map<string, string[]>();
      logs.set("script-1", existingLines);
      useScriptsStore.setState({ logs });

      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:log") {
          cb({ scriptId: "script-1", service: "api", script: "dev", line: "overflow-line" });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      const logLines = useScriptsStore.getState().logs.get("script-1")!;
      expect(logLines).toHaveLength(1000);
      expect(logLines[logLines.length - 1]).toBe("overflow-line");
      expect(logLines[0]).toBe("line-1"); // line-0 was dropped
    });

    it("scripts:discovering adds projectId to discoveringProjects", () => {
      useScriptsStore.setState({ discoveringProjects: new Set() });

      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:discovering") {
          cb({ projectId: "proj1" });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      expect(useScriptsStore.getState().discoveringProjects.has("proj1")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // fetchLogs
  // -----------------------------------------------------------------------

  describe("fetchLogs()", () => {
    it("fetches and stores log lines", async () => {
      mockRequest.mockResolvedValueOnce(["line1", "line2"]);

      await useScriptsStore.getState().fetchLogs("8080:api:dev");

      expect(mockRequest).toHaveBeenCalledWith("scripts.logs", {
        scriptId: "8080:api:dev",
        limit: 200,
      });
      expect(useScriptsStore.getState().logs.get("8080:api:dev")).toEqual(["line1", "line2"]);
    });

    it("silently ignores transport errors", async () => {
      mockRequest.mockRejectedValueOnce(new Error("not ready"));

      await useScriptsStore.getState().fetchLogs("8080:api:dev");

      expect(useScriptsStore.getState().logs.has("8080:api:dev")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Derived selectors (React hooks)
  // -----------------------------------------------------------------------

  describe("useIsDiscovering()", () => {
    it("returns true when current project is being discovered", () => {
      useScriptsStore.setState({
        currentWorkspaceId: "proj1/ws1",
        discoveringProjects: new Set(["proj1"]),
      });

      const { result } = renderHook(() => useIsDiscovering());
      expect(result.current).toBe(true);
    });

    it("returns false when current project is not being discovered", () => {
      useScriptsStore.setState({
        currentWorkspaceId: "proj1/ws1",
        discoveringProjects: new Set(["proj2"]),
      });

      const { result } = renderHook(() => useIsDiscovering());
      expect(result.current).toBe(false);
    });

    it("returns false when no workspace is selected", () => {
      useScriptsStore.setState({
        currentWorkspaceId: null,
        discoveringProjects: new Set(["proj1"]),
      });

      const { result } = renderHook(() => useIsDiscovering());
      expect(result.current).toBe(false);
    });

    it("returns false when discovering set is empty", () => {
      useScriptsStore.setState({
        currentWorkspaceId: "proj1/ws1",
        discoveringProjects: new Set(),
      });

      const { result } = renderHook(() => useIsDiscovering());
      expect(result.current).toBe(false);
    });
  });

  describe("useDiscoveryError()", () => {
    it("returns error string for current project", () => {
      useScriptsStore.setState({
        currentWorkspaceId: "proj1/ws1",
        discoveryErrors: new Map([["proj1", "something went wrong"]]),
      });

      const { result } = renderHook(() => useDiscoveryError());
      expect(result.current).toBe("something went wrong");
    });

    it("returns null when no error exists for current project", () => {
      useScriptsStore.setState({
        currentWorkspaceId: "proj1/ws1",
        discoveryErrors: new Map(),
      });

      const { result } = renderHook(() => useDiscoveryError());
      expect(result.current).toBeNull();
    });

    it("returns null when no workspace is selected", () => {
      useScriptsStore.setState({
        currentWorkspaceId: null,
        discoveryErrors: new Map([["proj1", "error"]]),
      });

      const { result } = renderHook(() => useDiscoveryError());
      expect(result.current).toBeNull();
    });

    it("returns error only for the matching project", () => {
      useScriptsStore.setState({
        currentWorkspaceId: "proj1/ws1",
        discoveryErrors: new Map([["proj2", "wrong project error"]]),
      });

      const { result } = renderHook(() => useDiscoveryError());
      expect(result.current).toBeNull();
    });
  });
});
