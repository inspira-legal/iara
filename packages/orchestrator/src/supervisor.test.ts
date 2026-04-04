import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ResolvedServiceDef } from "@iara/contracts";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const { mockCreateConnection, mockSpawnInShell } = vi.hoisted(() => ({
  mockCreateConnection: vi.fn(),
  mockSpawnInShell: vi.fn(),
}));

vi.mock("@iara/shared/platform", () => ({
  isWindows: false,
  spawnWithLoginShell: mockSpawnInShell,
}));

vi.mock("@iara/shared/env", () => ({
  cleanEnv: () => ({ PATH: "/usr/bin" }),
}));

/** Creates a fake socket for checkPort. */
function createMockSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    destroy: ReturnType<typeof vi.fn>;
    setTimeout: ReturnType<typeof vi.fn>;
  };
  socket.destroy = vi.fn();
  socket.setTimeout = vi.fn();
  return socket;
}

// By default, sockets emit "error" asynchronously (port not in use).
// Tests that need "connect" should override via mockCreateConnection.mockImplementation
mockCreateConnection.mockImplementation(() => {
  const socket = createMockSocket();
  // Default: port not in use — emit error on next microtask
  queueMicrotask(() => socket.emit("error", new Error("ECONNREFUSED")));
  return socket;
});

vi.mock("node:net", () => ({
  createConnection: (...args: unknown[]) => mockCreateConnection(...args),
}));

/** Creates a fake ChildProcess that behaves like spawnWithLoginShell() output. */
function createMockChild(pid = 12345) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    killTree: ReturnType<typeof vi.fn>;
  };
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killTree = vi.fn(() => vi.fn());
  return child;
}

let mockChild: ReturnType<typeof createMockChild>;

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------
import { ScriptSupervisor, topologicalSort } from "./supervisor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolved(
  name: string,
  dependsOn: string[] = [],
  overrides: Partial<ResolvedServiceDef> = {},
): ResolvedServiceDef {
  return {
    name,
    config: { port: "auto" },
    dependsOn,
    timeout: 30,
    essencial: {},
    advanced: {},
    isRepo: false,
    resolvedPort: 3000,
    resolvedEnv: {},
    ...overrides,
  };
}

function defaultStartOpts(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "proj1",
    workspace: "default",
    service: "api",
    script: "dev",
    commands: ["npm start"],
    cwd: "/tmp/test",
    interpolationCtx: { config: { port: 3000 }, env: {}, allConfigs: {} },
    port: 3000,
    output: "always" as const,
    isLongRunning: false,
    ...overrides,
  };
}

/** Make mockCreateConnection emit "connect" (port in use). */
function mockPortInUse() {
  mockCreateConnection.mockImplementationOnce(() => {
    const socket = createMockSocket();

    queueMicrotask(() => socket.emit("connect"));
    return socket;
  });
}

/** Make mockCreateConnection emit "error" (port not in use). */
function mockPortFree() {
  mockCreateConnection.mockImplementationOnce(() => {
    const socket = createMockSocket();

    queueMicrotask(() => socket.emit("error", new Error("ECONNREFUSED")));
    return socket;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockChild = createMockChild();
  mockSpawnInShell.mockImplementation(() => mockChild);
  // Reset default implementation
  mockCreateConnection.mockImplementation(() => {
    const socket = createMockSocket();

    queueMicrotask(() => socket.emit("error", new Error("ECONNREFUSED")));
    return socket;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------

describe("topologicalSort", () => {
  it("sorts services with no deps", () => {
    const services = [makeResolved("a"), makeResolved("b"), makeResolved("c")];
    const sorted = topologicalSort(services);
    expect(sorted.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  it("puts dependencies first", () => {
    const services = [
      makeResolved("frontend", ["backend"]),
      makeResolved("backend", ["db"]),
      makeResolved("db"),
    ];
    const sorted = topologicalSort(services);
    const names = sorted.map((s) => s.name);
    expect(names.indexOf("db")).toBeLessThan(names.indexOf("backend"));
    expect(names.indexOf("backend")).toBeLessThan(names.indexOf("frontend"));
  });

  it("detects circular dependencies", () => {
    const services = [makeResolved("a", ["b"]), makeResolved("b", ["a"])];
    expect(() => topologicalSort(services)).toThrow("Circular dependency");
  });

  it("handles diamond dependencies", () => {
    const services = [
      makeResolved("app", ["lib-a", "lib-b"]),
      makeResolved("lib-a", ["core"]),
      makeResolved("lib-b", ["core"]),
      makeResolved("core"),
    ];
    const sorted = topologicalSort(services);
    const names = sorted.map((s) => s.name);
    expect(names.indexOf("core")).toBeLessThan(names.indexOf("lib-a"));
    expect(names.indexOf("core")).toBeLessThan(names.indexOf("lib-b"));
    expect(names.indexOf("lib-a")).toBeLessThan(names.indexOf("app"));
    expect(names.indexOf("lib-b")).toBeLessThan(names.indexOf("app"));
  });

  it("ignores dependsOn referencing unknown services", () => {
    const services = [makeResolved("a", ["unknown"]), makeResolved("b")];
    const sorted = topologicalSort(services);
    expect(sorted.map((s) => s.name)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// ScriptSupervisor
// ---------------------------------------------------------------------------

describe("ScriptSupervisor", () => {
  // -----------------------------------------------------------------------
  // Constructor / basic
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates instance with push function", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);
      expect(supervisor).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // start
  // -----------------------------------------------------------------------

  describe("start()", () => {
    it("spawns a process and pushes starting status", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts());

      expect(push).toHaveBeenCalledWith(
        "scripts:log",
        expect.objectContaining({
          scriptId: "3000:api:dev",
          line: expect.stringContaining("npm start"),
        }),
      );
      expect(push).toHaveBeenCalledWith(
        "scripts:status",
        expect.objectContaining({
          service: "api",
          script: "dev",
          status: expect.objectContaining({
            health: "starting",
            pid: 12345,
          }),
        }),
      );
    });

    it("joins multiple commands with &&", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ commands: ["cmd1", "cmd2"] }));

      const logCall = push.mock.calls.find((c) => c[0] === "scripts:log");
      expect(logCall![1].line).toBe("> cmd1 && cmd2");
    });

    it("marks non-long-running as running immediately", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: false }));

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.health).toBe("running");
    });

    it("marks long-running without port as running immediately", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 0 }));

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.health).toBe("running");
    });

    it("marks long-running with negative port as running immediately", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: -1 }));

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.health).toBe("running");
    });

    it("starts health check for long-running with port > 0", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 3000 }));

      const statuses = supervisor.status();
      expect(statuses[0]!.health).toBe("starting");
    });

    it("stops existing script with same key before starting new one", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts());
      const firstChild = mockChild;

      mockChild = createMockChild(99999);
      supervisor.start(defaultStartOpts());

      expect(firstChild.killTree).toHaveBeenCalled();
    });

    it("reuses pinned-port service if already running", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ port: 3000 }));
      const callCount = push.mock.calls.length;

      supervisor.start(defaultStartOpts({ port: 3000 }));

      expect(push.mock.calls.length).toBe(callCount);
    });

    it("handles child exit with code 0 for long-running (stopped)", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 0 }));
      mockChild.emit("exit", 0);

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.health).toBe("stopped");
      expect(lastStatus.status.exitCode).toBe(0);
      expect(lastStatus.status.pid).toBeNull();
    });

    it("handles child exit with non-zero code for long-running (unhealthy)", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 0 }));
      mockChild.emit("exit", 1);

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.health).toBe("unhealthy");
    });

    it("handles child exit with code 0 for one-shot (success)", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: false }));
      mockChild.emit("exit", 0);

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.health).toBe("success");
    });

    it("handles child exit with non-zero code for one-shot (failed)", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: false }));
      mockChild.emit("exit", 1);

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.health).toBe("failed");
    });

    it("handles child exit with null code", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: false }));
      mockChild.emit("exit", null);

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.exitCode).toBe(1);
      expect(lastStatus.status.health).toBe("failed");
    });

    it("captures stdout output", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts());
      mockChild.stdout.emit("data", Buffer.from("hello world\n"));

      const logCalls = push.mock.calls.filter((c) => c[0] === "scripts:log");
      const lines = logCalls.map((c) => c[1].line);
      expect(lines).toContain("hello world");
    });

    it("captures stderr output", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts());
      mockChild.stderr.emit("data", Buffer.from("error msg\n"));

      const logCalls = push.mock.calls.filter((c) => c[0] === "scripts:log");
      const lines = logCalls.map((c) => c[1].line);
      expect(lines).toContain("error msg");
    });

    it("handles stdout error events", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      supervisor.start(defaultStartOpts());
      mockChild.stdout.emit("error", new Error("stream error"));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("stdout error"),
        "stream error",
      );
      consoleSpy.mockRestore();
    });

    it("handles stderr error events", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      supervisor.start(defaultStartOpts());
      mockChild.stderr.emit("error", new Error("stderr error"));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("stderr error"),
        "stderr error",
      );
      consoleSpy.mockRestore();
    });

    it("trims logs to MAX_LOG_LINES", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts());

      for (let i = 0; i < 1005; i++) {
        mockChild.stdout.emit("data", Buffer.from(`line-${i}\n`));
      }

      const logs = supervisor.logs("3000:api:dev", 2000);
      expect(logs.length).toBeLessThanOrEqual(1000);
    });

    it("handles child with no pid", () => {
      const noPidChild = createMockChild();
      (noPidChild as any).pid = undefined;
      mockChild = noPidChild;

      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);
      supervisor.start(defaultStartOpts());

      const statuses = supervisor.status();
      expect(statuses[0]!.pid).toBeNull();

      // stop should not call killTree since pid was undefined
      supervisor.stop("3000:api:dev");
      expect(noPidChild.killTree).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Health checks
  // -----------------------------------------------------------------------

  describe("health checks (long-running with port)", () => {
    it("becomes healthy when port check succeeds", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 3000 }));
      expect(supervisor.status()[0]!.health).toBe("starting");

      mockPortInUse();
      await vi.advanceTimersByTimeAsync(3000);

      expect(supervisor.status()[0]!.health).toBe("healthy");
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("becomes unhealthy after max retries", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      // timeout=6s, HEALTH_CHECK_INTERVAL=3s => maxRetries = ceil(6000/3000) = 2
      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 3000, timeout: 6 }));

      // First check fails
      mockPortFree();
      await vi.advanceTimersByTimeAsync(3000);
      expect(supervisor.status()[0]!.health).toBe("starting");

      // Second check fails — should become unhealthy
      mockPortFree();
      await vi.advanceTimersByTimeAsync(3000);
      expect(supervisor.status()[0]!.health).toBe("unhealthy");

      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("transitions from healthy to unhealthy on re-check failure", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 3000 }));

      // Become healthy
      mockPortInUse();
      await vi.advanceTimersByTimeAsync(3000);
      expect(supervisor.status()[0]!.health).toBe("healthy");

      // Re-check interval (30s) — port fails
      mockPortFree();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(supervisor.status()[0]!.health).toBe("unhealthy");

      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("recovers from unhealthy to healthy on re-check success", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 3000 }));

      // Become healthy
      mockPortInUse();
      await vi.advanceTimersByTimeAsync(3000);
      expect(supervisor.status()[0]!.health).toBe("healthy");

      // Re-check fails
      mockPortFree();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(supervisor.status()[0]!.health).toBe("unhealthy");

      // Re-check succeeds
      mockPortInUse();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(supervisor.status()[0]!.health).toBe("healthy");

      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("clears health check timer on exit", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 3000 }));

      // Process exits before health check fires
      mockChild.emit("exit", 1);

      expect(supervisor.status()[0]!.health).toBe("unhealthy");

      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("stays healthy on re-check when still healthy", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 3000 }));

      // Become healthy
      mockPortInUse();
      await vi.advanceTimersByTimeAsync(3000);
      expect(supervisor.status()[0]!.health).toBe("healthy");

      // Re-check succeeds — should stay healthy (no status change)
      const callsBefore = push.mock.calls.length;
      mockPortInUse();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(supervisor.status()[0]!.health).toBe("healthy");
      // No extra status push when already healthy
      const statusCallsAfter = push.mock.calls
        .slice(callsBefore)
        .filter((c) => c[0] === "scripts:status");
      expect(statusCallsAfter).toHaveLength(0);

      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // stop / stopAll
  // -----------------------------------------------------------------------

  describe("stop()", () => {
    it("stops a running script", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      await supervisor.start(defaultStartOpts());
      await supervisor.stop("3000:api:dev");

      const statusCalls = push.mock.calls.filter((c) => c[0] === "scripts:status");
      const lastStatus = statusCalls[statusCalls.length - 1]![1];
      expect(lastStatus.status.health).toBe("stopped");
    });

    it("no-op for non-existent key", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);
      supervisor.stop("nonexistent");
    });

    it("removes entry from running map", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      await supervisor.start(defaultStartOpts());
      expect(supervisor.status()).toHaveLength(1);

      await supervisor.stop("3000:api:dev");
      expect(supervisor.status()).toHaveLength(0);
    });

    it("clears health check timer on stop", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ isLongRunning: true, port: 3000 }));
      supervisor.stop("3000:api:dev");

      // Advancing timers should not cause errors
      await vi.advanceTimersByTimeAsync(10_000);
      vi.useRealTimers();
    });
  });

  describe("stopAll()", () => {
    it("stops all running scripts for the given workspace", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ service: "api", port: 3000 }));
      mockChild = createMockChild(99999);
      supervisor.start(defaultStartOpts({ service: "web", port: 4000 }));

      supervisor.stopAll("proj1", "default");

      const statusCalls = push.mock.calls.filter(
        (c) => c[0] === "scripts:status" && c[1].status.health === "stopped",
      );
      expect(statusCalls.length).toBe(2);
      expect(supervisor.status()).toEqual([]);
    });

    it("does not stop scripts from other workspaces", () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      supervisor.start(defaultStartOpts({ workspace: "ws1", port: 3000 }));
      mockChild = createMockChild(99999);
      supervisor.start(defaultStartOpts({ workspace: "ws2", port: 4000 }));

      supervisor.stopAll("proj1", "ws1");

      // Only ws1 stopped
      expect(supervisor.status("proj1", "ws1")).toEqual([]);
      expect(supervisor.status("proj1", "ws2")).toHaveLength(1);

      // Cleanup
      supervisor.stopAll("proj1", "ws2");
    });
  });

  // -----------------------------------------------------------------------
  // status
  // -----------------------------------------------------------------------

  describe("status()", () => {
    it("returns empty array when nothing running", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      expect(supervisor.status()).toEqual([]);
    });

    it("returns all running scripts", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      supervisor.start(defaultStartOpts({ service: "api", port: 3000 }));
      mockChild = createMockChild(99999);
      supervisor.start(defaultStartOpts({ service: "web", port: 4000 }));

      const statuses = supervisor.status();
      expect(statuses).toHaveLength(2);
    });

    it("filters by projectId", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      supervisor.start(defaultStartOpts({ projectId: "proj1", port: 3000 }));
      mockChild = createMockChild(99999);
      supervisor.start(defaultStartOpts({ projectId: "proj2", port: 4000 }));

      expect(supervisor.status("proj1")).toHaveLength(1);
      expect(supervisor.status("proj1")[0]!.projectId).toBe("proj1");
    });

    it("filters by projectId and workspace", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      supervisor.start(defaultStartOpts({ projectId: "proj1", workspace: "ws1", port: 3000 }));
      mockChild = createMockChild(99999);
      supervisor.start(defaultStartOpts({ projectId: "proj1", workspace: "ws2", port: 4000 }));

      expect(supervisor.status("proj1", "ws1")).toHaveLength(1);
      expect(supervisor.status("proj1", "ws1")[0]!.workspace).toBe("ws1");
    });

    it("returns correct shape", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      supervisor.start(defaultStartOpts());

      const s = supervisor.status()[0]!;
      expect(s).toHaveProperty("scriptId");
      expect(s).toHaveProperty("projectId");
      expect(s).toHaveProperty("workspace");
      expect(s).toHaveProperty("service");
      expect(s).toHaveProperty("script");
      expect(s).toHaveProperty("pid");
      expect(s).toHaveProperty("health");
      expect(s).toHaveProperty("exitCode");
    });
  });

  // -----------------------------------------------------------------------
  // logs
  // -----------------------------------------------------------------------

  describe("logs()", () => {
    it("returns empty array for non-existent script", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      expect(supervisor.logs("nonexistent")).toEqual([]);
    });

    it("returns buffered logs", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      supervisor.start(defaultStartOpts());

      mockChild.stdout.emit("data", Buffer.from("line1\nline2\n"));

      const logs = supervisor.logs("3000:api:dev");
      expect(logs).toContain("line1");
      expect(logs).toContain("line2");
    });

    it("respects limit parameter", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      supervisor.start(defaultStartOpts());

      for (let i = 0; i < 10; i++) {
        mockChild.stdout.emit("data", Buffer.from(`line-${i}\n`));
      }

      const logs = supervisor.logs("3000:api:dev", 3);
      expect(logs).toHaveLength(3);
    });

    it("uses default limit of 100", () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      supervisor.start(defaultStartOpts());

      for (let i = 0; i < 200; i++) {
        mockChild.stdout.emit("data", Buffer.from(`line-${i}\n`));
      }

      const logs = supervisor.logs("3000:api:dev");
      expect(logs).toHaveLength(100);
    });
  });

  // -----------------------------------------------------------------------
  // startChecked
  // -----------------------------------------------------------------------

  describe("startChecked()", () => {
    it("starts normally when port is not in use", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      mockPortFree();
      await supervisor.startChecked(defaultStartOpts({ isLongRunning: true, port: 3000 }));

      expect(supervisor.status()).toHaveLength(1);
      expect(supervisor.status()[0]!.pid).toBe(12345);
    });

    it("attaches to existing service when port is in use", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      mockPortInUse();
      await supervisor.startChecked(defaultStartOpts({ isLongRunning: true, port: 5000 }));

      const statuses = supervisor.status();
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.health).toBe("healthy");
      expect(statuses[0]!.pid).toBeNull();
    });

    it("does not check port for non-long-running scripts", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      await supervisor.startChecked(defaultStartOpts({ isLongRunning: false, port: 5000 }));

      expect(supervisor.status()).toHaveLength(1);
      expect(supervisor.status()[0]!.pid).toBe(12345);
    });

    it("does not check port when port is 0", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      await supervisor.startChecked(defaultStartOpts({ isLongRunning: true, port: 0 }));

      expect(supervisor.status()).toHaveLength(1);
      expect(supervisor.status()[0]!.health).toBe("running");
    });

    it("attaches with correct log message when port is in use", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      mockPortInUse();
      await supervisor.startChecked(defaultStartOpts({ isLongRunning: true, port: 5000 }));

      const logs = supervisor.logs("5000:api:dev");
      expect(logs[0]).toContain("Port 5000 already in use");
    });
  });

  // -----------------------------------------------------------------------
  // autoDetect
  // -----------------------------------------------------------------------

  describe("autoDetect()", () => {
    it("skips services with port <= 0", async () => {
      const supervisor = new ScriptSupervisor(vi.fn());

      await supervisor.autoDetect("proj1", "default", [{ name: "svc", resolvedPort: 0 }]);

      expect(supervisor.status()).toHaveLength(0);
    });

    it("skips already tracked services", async () => {
      const supervisor = new ScriptSupervisor(vi.fn());
      supervisor.start(defaultStartOpts({ service: "api", port: 3000, script: "dev" }));

      await supervisor.autoDetect("proj1", "default", [{ name: "api", resolvedPort: 3000 }]);

      expect(supervisor.status()).toHaveLength(1);
    });

    it("detects services running on ports", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      mockPortInUse();
      await supervisor.autoDetect("proj1", "default", [{ name: "api", resolvedPort: 5000 }]);

      const statuses = supervisor.status();
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.health).toBe("healthy");
      expect(statuses[0]!.service).toBe("api");
      expect(statuses[0]!.script).toBe("dev");
    });

    it("skips services where port check fails", async () => {
      const supervisor = new ScriptSupervisor(vi.fn());

      mockPortFree();
      await supervisor.autoDetect("proj1", "default", [{ name: "api", resolvedPort: 5000 }]);

      expect(supervisor.status()).toHaveLength(0);
    });

    it("detects multiple services", async () => {
      const supervisor = new ScriptSupervisor(vi.fn());

      mockPortInUse();
      mockPortInUse();
      await supervisor.autoDetect("proj1", "default", [
        { name: "api", resolvedPort: 5000 },
        { name: "web", resolvedPort: 5001 },
      ]);

      expect(supervisor.status()).toHaveLength(2);
    });

    it("includes detection log message", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      mockPortInUse();
      await supervisor.autoDetect("proj1", "default", [{ name: "api", resolvedPort: 5000 }]);

      const logs = supervisor.logs("5000:api:dev");
      expect(logs[0]).toContain("Detected service running on port 5000");
    });
  });

  // -----------------------------------------------------------------------
  // runAll
  // -----------------------------------------------------------------------

  describe("runAll()", () => {
    it("starts services in topological order", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("api", [], {
          resolvedPort: 3000,
          essencial: { dev: { run: ["npm run dev"], output: "always" } },
        }),
      ];

      mockPortFree();

      await supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "dev",
        services,
        cwd: () => "/tmp",
      });

      expect(supervisor.status()).toHaveLength(1);
      expect(supervisor.status()[0]!.service).toBe("api");
    });

    it("skips services without the requested category", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("api", [], { resolvedPort: 3000, essencial: {} }),
      ];

      await supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "dev",
        services,
        cwd: () => "/tmp",
      });

      expect(supervisor.status()).toHaveLength(0);
    });

    it("runs one-shot scripts (non-dev category)", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("api", [], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm run build"], output: "always" } },
        }),
      ];

      await supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "build",
        services,
        cwd: () => "/tmp",
      });

      expect(supervisor.status()).toHaveLength(1);
    });

    it("waits for dependency health before starting dependents", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("db", [], {
          resolvedPort: 5432,
          timeout: 30,
          essencial: { dev: { run: ["pg_start"], output: "always" } },
        }),
        makeResolved("api", ["db"], {
          resolvedPort: 3000,
          essencial: { dev: { run: ["npm run dev"], output: "always" } },
        }),
      ];

      mockPortFree(); // db startChecked port check

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "dev",
        services,
        cwd: () => "/tmp",
      });

      // Let checkPort microtask resolve
      await vi.advanceTimersByTimeAsync(1);

      // Health check fires at 3s — make db healthy
      mockPortInUse();
      await vi.advanceTimersByTimeAsync(3000);

      // waitForHealth polls at 500ms
      await vi.advanceTimersByTimeAsync(500);

      // api startChecked
      mockPortFree();
      await vi.advanceTimersByTimeAsync(1);

      await runPromise;

      expect(supervisor.status().length).toBe(2);
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("continues to start remaining services if dependency health fails", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("db", [], {
          resolvedPort: 5432,
          timeout: 3,
          essencial: { dev: { run: ["pg_start"], output: "always" } },
        }),
        makeResolved("api", ["db"], {
          resolvedPort: 3000,
          essencial: { dev: { run: ["npm run dev"], output: "always" } },
        }),
      ];

      mockPortFree(); // db checkPort

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "dev",
        services,
        cwd: () => "/tmp",
      });

      await vi.advanceTimersByTimeAsync(1);

      // Health check fails — timeout=3s, maxRetries=ceil(3000/3000)=1
      mockPortFree();
      await vi.advanceTimersByTimeAsync(3000);

      // waitForHealth sees unhealthy and rejects
      await vi.advanceTimersByTimeAsync(500);

      // api should still start
      mockPortFree();
      await vi.advanceTimersByTimeAsync(1);

      await runPromise;

      expect(supervisor.status().length).toBeGreaterThanOrEqual(1);
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("handles long-running without port dependency (waitForRunning)", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("watcher", [], {
          resolvedPort: 0,
          essencial: { dev: { run: ["tsc --watch"], output: "always" } },
        }),
        makeResolved("api", ["watcher"], {
          resolvedPort: 3000,
          essencial: { dev: { run: ["npm run dev"], output: "always" } },
        }),
      ];

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "dev",
        services,
        cwd: () => "/tmp",
      });

      // watcher is immediately "running", waitForRunning resolves after 300ms check
      await vi.advanceTimersByTimeAsync(300);
      await vi.advanceTimersByTimeAsync(1);

      // api startChecked
      mockPortFree();
      await vi.advanceTimersByTimeAsync(1);

      await runPromise;
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("handles one-shot dependency (waitForExit)", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const child1 = createMockChild(1111);
      const child2 = createMockChild(2222);
      let childIdx = 0;
      mockSpawnInShell.mockImplementation(() => {
        const c = [child1, child2][childIdx] ?? child2;
        childIdx++;
        return c;
      });

      const services: ResolvedServiceDef[] = [
        makeResolved("setup", [], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm install"], output: "always" } },
        }),
        makeResolved("api", ["setup"], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm run build"], output: "always" } },
        }),
      ];

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "build",
        services,
        cwd: () => "/tmp",
      });

      await vi.advanceTimersByTimeAsync(100);

      // setup exits successfully
      child1.emit("exit", 0);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(100);

      await runPromise;

      expect(supervisor.status().length).toBe(2);
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("handles waitForExit timeout", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("setup", [], {
          resolvedPort: 0,
          timeout: 2,
          essencial: { build: { run: ["npm install"], output: "always" } },
        }),
        makeResolved("api", ["setup"], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm run build"], output: "always" } },
        }),
      ];

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "build",
        services,
        cwd: () => "/tmp",
      });

      // setup never exits — timeout after 2s
      await vi.advanceTimersByTimeAsync(2500);

      await runPromise;
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("handles waitForExit with failed exit code", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const child1 = createMockChild(1111);
      const child2 = createMockChild(2222);
      let childIdx = 0;
      mockSpawnInShell.mockImplementation(() => {
        const c = [child1, child2][childIdx] ?? child2;
        childIdx++;
        return c;
      });

      const services: ResolvedServiceDef[] = [
        makeResolved("setup", [], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm install"], output: "always" } },
        }),
        makeResolved("api", ["setup"], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm run build"], output: "always" } },
        }),
      ];

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "build",
        services,
        cwd: () => "/tmp",
      });

      await vi.advanceTimersByTimeAsync(100);
      child1.emit("exit", 1); // setup fails
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(100);

      await runPromise;
      expect(supervisor.status().length).toBeGreaterThanOrEqual(1);
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });

    it("does not wait for services with no dependents", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("api", [], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm run build"], output: "always" } },
        }),
        makeResolved("web", [], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm run build"], output: "always" } },
        }),
      ];

      await supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "build",
        services,
        cwd: () => "/tmp",
      });

      expect(supervisor.status()).toHaveLength(2);
    });

    it("interpolates {config.port} refs in commands", async () => {
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("api", [], {
          resolvedPort: 3000,
          resolvedEnv: {},
          essencial: {
            dev: { run: ["start --port {config.port}"], output: "always" },
          },
        }),
      ];

      await supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "dev",
        services,
        cwd: () => "/tmp",
      });

      const logCalls = push.mock.calls.filter((c) => c[0] === "scripts:log");
      const commandLog = logCalls.find((c) => c[1].line.includes("start --port"));
      expect(commandLog?.[1].line).toContain("start --port 3000");
    });
  });

  // -----------------------------------------------------------------------
  // waitForRunning edge case: entry removed
  // -----------------------------------------------------------------------

  describe("waitForRunning edge case", () => {
    it("resolves when entry is removed (no entry found)", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("watcher", [], {
          resolvedPort: 0,
          essencial: { dev: { run: ["tsc --watch"], output: "always" } },
        }),
        makeResolved("api", ["watcher"], {
          resolvedPort: 0,
          essencial: { dev: { run: ["npm run dev"], output: "always" } },
        }),
      ];

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "dev",
        services,
        cwd: () => "/tmp",
      });

      // Remove watcher entry — waitForRunning should see no entry and resolve
      supervisor.stop("0:watcher:dev");
      await vi.advanceTimersByTimeAsync(300);
      await vi.advanceTimersByTimeAsync(1);

      await runPromise;
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // waitForHealth edge case: entry removed
  // -----------------------------------------------------------------------

  describe("waitForHealth edge case", () => {
    it("rejects when entry is removed before becoming healthy", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("db", [], {
          resolvedPort: 5432,
          timeout: 30,
          essencial: { dev: { run: ["pg_start"], output: "always" } },
        }),
        makeResolved("api", ["db"], {
          resolvedPort: 3000,
          essencial: { dev: { run: ["npm run dev"], output: "always" } },
        }),
      ];

      mockPortFree(); // db port check

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "dev",
        services,
        cwd: () => "/tmp",
      });

      await vi.advanceTimersByTimeAsync(1);

      // Remove db entry — waitForHealth should reject
      supervisor.stop("5432:db:dev");
      await vi.advanceTimersByTimeAsync(500);

      // api should still start
      mockPortFree();
      await vi.advanceTimersByTimeAsync(1);

      await runPromise;
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // waitForExit edge case: entry removed
  // -----------------------------------------------------------------------

  describe("waitForExit edge case", () => {
    it("resolves when entry is removed during wait", async () => {
      vi.useFakeTimers();
      const push = vi.fn();
      const supervisor = new ScriptSupervisor(push);

      const services: ResolvedServiceDef[] = [
        makeResolved("setup", [], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm install"], output: "always" } },
        }),
        makeResolved("api", ["setup"], {
          resolvedPort: 0,
          essencial: { build: { run: ["npm run build"], output: "always" } },
        }),
      ];

      const runPromise = supervisor.runAll({
        projectId: "proj1",
        workspace: "default",
        category: "build",
        services,
        cwd: () => "/tmp",
      });

      await vi.advanceTimersByTimeAsync(100);

      // Remove setup — waitForExit should resolve
      supervisor.stop("0:setup:build");
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(100);

      await runPromise;
      supervisor.stopAll("proj1", "default");
      vi.useRealTimers();
    });
  });
});
