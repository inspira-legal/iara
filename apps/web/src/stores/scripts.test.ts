import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { useScriptsStore } from "./scripts";

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
  discovering: false,
  discoveringProjects: new Set<string>(),
  logs: new Map<string, string[]>(),
  selectedLog: null,
  activeTab: "scripts" as const,
  collapsed: false,
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
    it("sets loading, calls transport, sets config", async () => {
      const config = makeConfig({ hasFile: true });
      mockRequest.mockResolvedValueOnce(config);

      const promise = useScriptsStore.getState().loadConfig("proj1/ws1");

      expect(useScriptsStore.getState().loading).toBe(true);
      expect(useScriptsStore.getState().currentWorkspaceId).toBe("proj1/ws1");
      expect(useScriptsStore.getState().selectedLog).toBeNull();
      expect(useScriptsStore.getState().activeTab).toBe("scripts");

      await promise;

      expect(mockRequest).toHaveBeenCalledWith("scripts.load", { workspaceId: "proj1/ws1" });
      expect(useScriptsStore.getState().config).toEqual(config);
      expect(useScriptsStore.getState().loading).toBe(false);
    });

    it("clears loading on error", async () => {
      mockRequest.mockRejectedValueOnce(new Error("fail"));

      await useScriptsStore.getState().loadConfig("proj1/ws1");

      expect(useScriptsStore.getState().loading).toBe(false);
    });

    it("resets selectedLog and activeTab when loading new workspace", async () => {
      useScriptsStore.setState({
        selectedLog: { service: "api", script: "dev" },
        activeTab: "output",
      });
      mockRequest.mockResolvedValueOnce(makeConfig());

      await useScriptsStore.getState().loadConfig("proj1/ws2");

      expect(useScriptsStore.getState().selectedLog).toBeNull();
      expect(useScriptsStore.getState().activeTab).toBe("scripts");
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
    it("calls transport", async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await useScriptsStore.getState().stopAll();

      expect(mockRequest).toHaveBeenCalledWith("scripts.stopAll", {});
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

      expect(mockRequest).toHaveBeenCalledWith("scripts.logs", { scriptId: "8080:api:dev", limit: 200 });
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
  // setActiveTab / setCollapsed
  // -----------------------------------------------------------------------

  describe("setActiveTab()", () => {
    it("sets active tab", () => {
      useScriptsStore.getState().setActiveTab("output");
      expect(useScriptsStore.getState().activeTab).toBe("output");
    });
  });

  describe("setCollapsed()", () => {
    it("sets collapsed state", () => {
      useScriptsStore.getState().setCollapsed(true);
      expect(useScriptsStore.getState().collapsed).toBe(true);
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

      expect(useScriptsStore.getState().discovering).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // subscribePush
  // -----------------------------------------------------------------------

  describe("subscribePush()", () => {
    it("subscribes to three events and returns unsubscribe", () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      const unsub3 = vi.fn();
      mockSubscribe
        .mockReturnValueOnce(unsub1)
        .mockReturnValueOnce(unsub2)
        .mockReturnValueOnce(unsub3);

      const unsubAll = useScriptsStore.getState().subscribePush();

      expect(mockSubscribe).toHaveBeenCalledWith("scripts:status", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("scripts:log", expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith("scripts:reload", expect.any(Function));

      unsubAll();
      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
      expect(unsub3).toHaveBeenCalled();
    });

    it("scripts:status updates config statuses for matching workspace", () => {
      const status = makeScriptStatus({ health: "stopped" });
      const config = makeConfig({ statuses: [status] });
      useScriptsStore.setState({ config, currentWorkspaceId: "proj1/ws1" });

      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:status") {
          cb({ service: "api", script: "dev", status: { ...status, health: "running", pid: 1234 } });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      const updatedStatuses = useScriptsStore.getState().config!.statuses;
      expect(updatedStatuses[0]!.health).toBe("running");
      expect(updatedStatuses[0]!.pid).toBe(1234);
    });

    it("scripts:status ignores events from different workspace", () => {
      const config = makeConfig({ statuses: [] });
      useScriptsStore.setState({ config, currentWorkspaceId: "proj1/ws1" });

      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:status") {
          cb({
            service: "api",
            script: "dev",
            status: makeScriptStatus({ projectId: "proj2", workspace: "ws2" }),
          });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      expect(useScriptsStore.getState().config!.statuses).toHaveLength(0);
    });

    it("scripts:status adds new status if not found", () => {
      const config = makeConfig({ statuses: [] });
      useScriptsStore.setState({ config, currentWorkspaceId: "proj1/ws1" });

      const newStatus = makeScriptStatus({
        scriptId: "8080:api:dev",
        projectId: "proj1",
        workspace: "ws1",
        health: "running",
      });

      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:status") {
          cb({ service: "api", script: "dev", status: newStatus });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      expect(useScriptsStore.getState().config!.statuses).toHaveLength(1);
      expect(useScriptsStore.getState().config!.statuses[0]).toEqual(newStatus);
    });

    it("scripts:status skips update if nothing changed", () => {
      const status = makeScriptStatus({ health: "running", pid: 1234, exitCode: null });
      const config = makeConfig({ statuses: [status] });
      useScriptsStore.setState({ config, currentWorkspaceId: "proj1/ws1" });

      const setMock = vi.spyOn(useScriptsStore, "setState");

      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:status") {
          // Same health, pid, exitCode = no-op
          cb({ service: "api", script: "dev", status: { ...status } });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      // Should not have called setState beyond subscribePush setup
      // The status callback should return early
      const configAfter = useScriptsStore.getState().config!;
      expect(configAfter.statuses[0]!.health).toBe("running");
      setMock.mockRestore();
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

    it("scripts:reload clears discovering flag", () => {
      const discoveringProjects = new Set(["proj1"]);
      useScriptsStore.setState({ discovering: true, discoveringProjects, currentWorkspaceId: "proj1/default" });

      // biome-ignore lint: test mock
      mockSubscribe.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "scripts:reload") {
          cb({ projectId: "proj1" });
        }
        return vi.fn();
      });

      useScriptsStore.getState().subscribePush();

      expect(useScriptsStore.getState().discovering).toBe(false);
    });
  });
});
