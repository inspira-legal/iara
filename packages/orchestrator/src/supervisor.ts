import { execSync, spawn } from "node:child_process";
import { createConnection } from "node:net";
import type {
  EssencialKey,
  ResolvedServiceDef,
  ScriptOutputLevel,
  ScriptStatus,
  WsPushEvents,
} from "@iara/contracts";
import { cleanEnv } from "@iara/shared/env";
import { killProcessGroup } from "@iara/shared/process";
import { interpolate } from "./interpolation.js";

type PushFn = <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

interface RunningScript {
  scriptId: string;
  projectId: string;
  workspace: string;
  service: string;
  script: string;
  pid: number | null;
  health: ScriptStatus["health"];
  exitCode: number | null;
  output: ScriptOutputLevel;
  logs: string[];
  kill: () => void;
  /** Cancels the pending SIGKILL escalation timer. */
  cancelKill: (() => void) | null;
  healthCheckTimer?: ReturnType<typeof setInterval>;
}

const MAX_LOG_LINES = 1000;
const HEALTH_CHECK_INTERVAL = 3000;
/** Re-check healthy services every 30s to detect freezes. */
const HEALTH_RECHECK_INTERVAL = 30_000;

export class ScriptSupervisor {
  private running = new Map<string, RunningScript>();
  /**
   * Shared services keyed by pinned port.
   * Pinned-port services are shared across workspaces — only one instance runs.
   */
  private sharedByPort = new Map<number, string>();

  constructor(private readonly pushFn: PushFn) {}

  private key(port: number, service: string, script: string): string {
    return `${port}:${service}:${script}`;
  }

  /** Check if a service is already running (by us) on this port. */
  isPortOwnedByUs(port: number): boolean {
    return this.sharedByPort.has(port);
  }

  /** Start a script process. */
  start(opts: {
    projectId: string;
    workspace: string;
    service: string;
    script: string;
    commands: string[];
    cwd: string;
    env: Record<string, string>;
    port: number;
    output: ScriptOutputLevel;
    isLongRunning: boolean;
    isPinnedPort?: boolean;
    timeout?: number;
  }): void {
    const key = this.key(opts.port, opts.service, opts.script);

    // For pinned-port services: reuse if already running on this port
    if (opts.isPinnedPort && opts.port > 0) {
      const existingKey = this.sharedByPort.get(opts.port);
      if (existingKey && this.running.has(existingKey)) {
        // Already running — just report status as-is
        return;
      }
    }

    // Stop existing if running under same key
    if (this.running.has(key)) {
      this.stopByKey(key);
    }

    // Track pinned-port services as shared
    if (opts.isPinnedPort && opts.port > 0) {
      this.sharedByPort.set(opts.port, key);
    }

    const fullCommand = opts.commands.join(" && ");

    // Log the command being executed
    this.pushFn("scripts:log", {
      scriptId: key,
      service: opts.service,
      script: opts.script,
      line: `> ${fullCommand}`,
    });

    const child = spawn(fullCommand, {
      cwd: opts.cwd,
      env: { ...cleanEnv(), ...opts.env },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const entry: RunningScript = {
      scriptId: key,
      projectId: opts.projectId,
      workspace: opts.workspace,
      service: opts.service,
      script: opts.script,
      pid: child.pid ?? null,
      health: "starting",
      exitCode: null,
      output: opts.output,
      logs: [`> ${fullCommand}`],
      cancelKill: null,
      kill: () => {
        if (child.pid) {
          entry.cancelKill = killProcessGroup(child.pid, { graceMs: 3000 });
        }
      },
    };

    this.running.set(key, entry);
    this.pushStatus(entry);

    const appendLog = (line: string) => {
      entry.logs.push(line);
      if (entry.logs.length > MAX_LOG_LINES) {
        entry.logs.shift();
      }
      this.pushFn("scripts:log", {
        scriptId: key,
        service: opts.service,
        script: opts.script,
        line,
      });
    };

    // Handle stdout/stderr with error handlers to prevent unhandled stream errors
    if (child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n").filter(Boolean)) {
          appendLog(line);
        }
      });
      child.stdout.on("error", (err) => {
        console.error(`[supervisor] stdout error for ${key}:`, err.message);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n").filter(Boolean)) {
          appendLog(line);
        }
      });
      child.stderr.on("error", (err) => {
        console.error(`[supervisor] stderr error for ${key}:`, err.message);
      });
    }

    child.on("exit", (code) => {
      // Cancel any pending SIGKILL timer from a prior kill() call
      if (entry.cancelKill) {
        entry.cancelKill();
        entry.cancelKill = null;
      }
      if (entry.healthCheckTimer) clearInterval(entry.healthCheckTimer);
      entry.pid = null;
      entry.exitCode = code ?? 1;

      if (opts.isLongRunning) {
        entry.health = code === 0 ? "stopped" : "unhealthy";
      } else {
        entry.health = code === 0 ? "success" : "failed";
      }
      this.pushStatus(entry);
    });

    // Health check for long-running scripts
    if (opts.isLongRunning && opts.port > 0) {
      const timeout = (opts.timeout ?? 30) * 1000;
      const maxRetries = Math.ceil(timeout / HEALTH_CHECK_INTERVAL);
      let retries = 0;
      let becameHealthy = false;

      entry.healthCheckTimer = setInterval(() => {
        retries++;
        checkPort(opts.port)
          .then((ok) => {
            if (ok && !becameHealthy) {
              // First time healthy — switch to slower re-check interval
              becameHealthy = true;
              entry.health = "healthy";
              this.pushStatus(entry);
              if (entry.healthCheckTimer) clearInterval(entry.healthCheckTimer);

              // Start periodic re-checks to detect frozen services
              entry.healthCheckTimer = setInterval(() => {
                checkPort(opts.port)
                  .then((stillOk) => {
                    if (!stillOk && entry.health === "healthy") {
                      entry.health = "unhealthy";
                      this.pushStatus(entry);
                    } else if (stillOk && entry.health === "unhealthy") {
                      entry.health = "healthy";
                      this.pushStatus(entry);
                    }
                  })
                  .catch(() => {
                    // ignore re-check errors
                  });
              }, HEALTH_RECHECK_INTERVAL);
            } else if (ok && becameHealthy) {
              // Still healthy on re-check — recover if previously unhealthy
              if (entry.health === "unhealthy") {
                entry.health = "healthy";
                this.pushStatus(entry);
              }
            } else if (!ok && retries >= maxRetries && !becameHealthy) {
              entry.health = "unhealthy";
              this.pushStatus(entry);
              if (entry.healthCheckTimer) clearInterval(entry.healthCheckTimer);
            }
          })
          .catch(() => {
            // ignore check errors
          });
      }, HEALTH_CHECK_INTERVAL);
    } else if (opts.isLongRunning && opts.port <= 0) {
      // Long-running without port (e.g., tsc watch) — mark as running immediately
      entry.health = "running";
      this.pushStatus(entry);
    } else if (!opts.isLongRunning) {
      entry.health = "running";
      this.pushStatus(entry);
    }
  }

  /**
   * Start with port pre-check.
   * If the port is already in use (externally) and this is a long-running script,
   * attach as healthy without spawning.
   */
  async startChecked(opts: Parameters<ScriptSupervisor["start"]>[0]): Promise<void> {
    if (opts.isLongRunning && opts.port > 0) {
      const inUse = await checkPort(opts.port);
      if (inUse) {
        const key = this.key(opts.port, opts.service, opts.script);
        // Track as shared if pinned
        if (opts.isPinnedPort) {
          this.sharedByPort.set(opts.port, key);
        }
        const attachedPort = opts.port;
        const entry: RunningScript = {
          scriptId: key,
          projectId: opts.projectId,
          workspace: opts.workspace,
          service: opts.service,
          script: opts.script,
          pid: null,
          health: "healthy",
          exitCode: null,
          output: opts.output,
          logs: [`[iara] Port ${attachedPort} already in use — attached to existing service`],
          cancelKill: null,
          kill: () => killByPort(attachedPort),
        };
        this.running.set(key, entry);
        this.pushStatus(entry);
        return;
      }
    }
    this.start(opts);
  }

  /** Stop a running script by its id. */
  stop(id: string): void {
    this.stopByKey(id);
  }

  private stopByKey(key: string): void {
    const entry = this.running.get(key);
    if (!entry) return;

    entry.kill();
    if (entry.healthCheckTimer) clearInterval(entry.healthCheckTimer);
    entry.health = "stopped";
    this.pushStatus(entry);
    this.running.delete(key);
    // Clean up shared port mapping
    for (const [port, k] of this.sharedByPort) {
      if (k === key) {
        this.sharedByPort.delete(port);
        break;
      }
    }
  }

  /** Stop all running scripts for a specific workspace. */
  stopAll(projectId: string, workspace: string): void {
    for (const [key, entry] of this.running) {
      if (entry.projectId !== projectId || entry.workspace !== workspace) continue;
      entry.kill();
      if (entry.healthCheckTimer) clearInterval(entry.healthCheckTimer);
      entry.health = "stopped";
      this.pushStatus(entry);
      this.running.delete(key);
      // Clean up shared port mapping
      for (const [port, k] of this.sharedByPort) {
        if (k === key) {
          this.sharedByPort.delete(port);
          break;
        }
      }
    }
  }

  /** Stop every running script (used for process cleanup on shutdown). */
  shutdown(): void {
    for (const entry of this.running.values()) {
      entry.kill();
      if (entry.healthCheckTimer) clearInterval(entry.healthCheckTimer);
    }
    this.running.clear();
    this.sharedByPort.clear();
  }

  /** Get status of scripts, optionally filtered by project/workspace. */
  status(projectId?: string, workspace?: string): ScriptStatus[] {
    let entries = [...this.running.values()];
    if (projectId) {
      entries = entries.filter(
        (e) => e.projectId === projectId && (workspace == null || e.workspace === workspace),
      );
    }
    return entries.map((e) => ({
      scriptId: e.scriptId,
      projectId: e.projectId,
      workspace: e.workspace,
      service: e.service,
      script: e.script,
      pid: e.pid,
      health: e.health,
      exitCode: e.exitCode,
    }));
  }

  /**
   * Auto-detect services already running on their ports.
   * Creates attached entries for any service whose port is in use
   * but not already tracked by the supervisor.
   */
  async autoDetect(
    projectId: string,
    workspace: string,
    services: { name: string; resolvedPort: number; port: number | null }[],
  ): Promise<void> {
    for (const svc of services) {
      if (svc.resolvedPort <= 0) continue;
      const key = this.key(svc.resolvedPort, svc.name, "dev");
      if (this.running.has(key)) continue;

      const inUse = await checkPort(svc.resolvedPort);
      if (inUse) {
        const attachedPort = svc.resolvedPort;
        const entry: RunningScript = {
          scriptId: key,
          projectId,
          workspace,
          service: svc.name,
          script: "dev",
          pid: null,
          health: "healthy",
          exitCode: null,
          output: "always",
          logs: [`[iara] Detected service running on port ${attachedPort}`],
          cancelKill: null,
          kill: () => killByPort(attachedPort),
        };
        this.running.set(key, entry);
        if (svc.port !== null) {
          this.sharedByPort.set(attachedPort, key);
        }
        this.pushStatus(entry);
      }
    }
  }

  /** Get buffered log lines by id. */
  logs(id: string, limit = 100): string[] {
    const entry = this.running.get(id);
    if (!entry) return [];
    return entry.logs.slice(-limit);
  }

  /**
   * Run an essencial category for all services, respecting dependsOn.
   * For `dev`: starts service then waits for health before starting dependents.
   * For one-shot: waits for exit code 0 before starting dependents.
   *
   * Resilient: if a dependency fails health/exit, dependents still attempt
   * to start (they'll fail naturally if the dep is truly needed).
   */
  async runAll(opts: {
    projectId: string;
    workspace: string;
    category: EssencialKey;
    services: ResolvedServiceDef[];
    ports: Map<string, number>;
    cwd: (service: string) => string;
  }): Promise<void> {
    const sorted = topologicalSort(opts.services);
    const isLongRunning = opts.category === "dev";

    // Build set of services that are depended on by others
    const dependedOn = new Set<string>();
    for (const svc of sorted) {
      for (const dep of svc.dependsOn) {
        dependedOn.add(dep);
      }
    }

    for (const svc of sorted) {
      const script = svc.essencial[opts.category];
      if (!script) continue;

      const resolvedCommands = script.run.map((cmd) => interpolate(cmd, opts.ports));

      await this.startChecked({
        projectId: opts.projectId,
        workspace: opts.workspace,
        service: svc.name,
        script: opts.category,
        commands: resolvedCommands,
        cwd: opts.cwd(svc.name),
        env: svc.resolvedEnv,
        port: svc.resolvedPort,
        output: script.output,
        isLongRunning,
        isPinnedPort: svc.port !== null,
        timeout: svc.timeout,
      });

      // Only wait if other services depend on this one
      if (!dependedOn.has(svc.name)) continue;

      // Wait for dependency to be ready before starting dependents.
      // If it fails, continue anyway — dependents will fail naturally.
      try {
        const svcKey = this.key(svc.resolvedPort, svc.name, opts.category);
        if (isLongRunning && svc.resolvedPort > 0) {
          this.pushFn("scripts:log", {
            scriptId: svcKey,
            service: svc.name,
            script: opts.category,
            line: `[iara] Waiting for ${svc.name} to be healthy on port ${svc.resolvedPort}...`,
          });
          await this.waitForHealth(svc.resolvedPort, svc.name, opts.category, svc.timeout);
          this.pushFn("scripts:log", {
            scriptId: svcKey,
            service: svc.name,
            script: opts.category,
            line: `[iara] ${svc.name} is healthy`,
          });
        } else if (isLongRunning) {
          await this.waitForRunning(svc.resolvedPort, svc.name, opts.category);
        } else {
          await this.waitForExit(svc.resolvedPort, svc.name, opts.category, svc.timeout);
        }
      } catch {
        // Dependency failed — continue starting remaining services
      }
    }
  }

  /** Wait until a script is in "running" state (process started). */
  private waitForRunning(port: number, service: string, script: string): Promise<void> {
    return new Promise((resolve) => {
      const key = this.key(port, service, script);
      // Give it a moment to start, then proceed
      const check = setInterval(() => {
        const entry = this.running.get(key);
        if (!entry || entry.health !== "starting") {
          clearInterval(check);
          resolve();
        }
      }, 300);
      // Max 5s wait for process to start
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    });
  }

  private waitForHealth(
    port: number,
    service: string,
    script: string,
    timeoutSec: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const key = this.key(port, service, script);
      const timeout = timeoutSec * 1000;
      const start = Date.now();

      const check = setInterval(() => {
        const entry = this.running.get(key);
        if (!entry) {
          clearInterval(check);
          reject(new Error(`Script ${key} exited before becoming healthy`));
          return;
        }
        if (entry.health === "healthy") {
          clearInterval(check);
          resolve();
          return;
        }
        if (entry.health === "unhealthy" || Date.now() - start > timeout) {
          clearInterval(check);
          reject(new Error(`Script ${key} failed to become healthy within ${timeoutSec}s`));
        }
      }, 500);
    });
  }

  private waitForExit(
    port: number,
    service: string,
    script: string,
    timeoutSec: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const key = this.key(port, service, script);
      const timeout = timeoutSec * 1000;
      const start = Date.now();

      const check = setInterval(() => {
        const entry = this.running.get(key);
        if (!entry) {
          clearInterval(check);
          resolve();
          return;
        }
        if (entry.health === "success") {
          clearInterval(check);
          resolve();
          return;
        }
        if (entry.health === "failed") {
          clearInterval(check);
          reject(new Error(`Script ${key} failed with exit code ${entry.exitCode}`));
          return;
        }
        if (Date.now() - start > timeout) {
          clearInterval(check);
          reject(new Error(`Script ${key} timed out after ${timeoutSec}s`));
        }
      }, 500);
    });
  }

  private pushStatus(entry: RunningScript): void {
    this.pushFn("scripts:status", {
      service: entry.service,
      script: entry.script,
      status: {
        scriptId: entry.scriptId,
        projectId: entry.projectId,
        workspace: entry.workspace,
        service: entry.service,
        script: entry.script,
        pid: entry.pid,
        health: entry.health,
        exitCode: entry.exitCode,
      },
    });
  }
}

/** Kill process(es) listening on a port via lsof. */
function killByPort(port: number): void {
  try {
    const result = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
    for (const pid of result.split("\n").filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // Already dead
      }
    }
  } catch {
    // No process found on port
  }
}

/** TCP port check — resolves true if port is accepting connections. */
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Topological sort of services based on dependsOn.
 * Services with no dependencies come first.
 */
function topologicalSort(services: ResolvedServiceDef[]): ResolvedServiceDef[] {
  const byName = new Map(services.map((s) => [s.name, s]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const result: ResolvedServiceDef[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (stack.has(name)) {
      throw new Error(`Circular dependency detected: ${[...stack, name].join(" → ")}`);
    }
    const svc = byName.get(name);
    if (!svc) return;

    stack.add(name);
    for (const dep of svc.dependsOn) {
      visit(dep);
    }
    stack.delete(name);
    visited.add(name);
    result.push(svc);
  }

  for (const svc of services) {
    visit(svc.name);
  }

  return result;
}

export { topologicalSort };
