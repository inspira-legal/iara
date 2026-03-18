import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { EventEmitter } from "node:events";

export interface DevCommand {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  type: "frontend" | "backend" | "unknown";
  port?: number | undefined;
}

export interface DevServerStatus {
  name: string;
  pid: number | null;
  port: number | null;
  health: "starting" | "healthy" | "unhealthy" | "stopped";
  type: "frontend" | "backend" | "unknown";
}

interface RunningServer {
  command: DevCommand;
  process: ChildProcess;
  port: number | null;
  health: "starting" | "healthy" | "unhealthy";
  logs: string[];
}

const MAX_LOG_LINES = 1000;
const HEALTH_CHECK_INTERVAL = 3000;
const HEALTH_CHECK_RETRIES = 20;

const FRONTEND_PATTERNS = ["vite", "next", "remix", "astro", "webpack-dev-server", "react-scripts"];
const PORT_REGEX = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/;

export class DevServerSupervisor extends EventEmitter {
  private servers = new Map<string, RunningServer>();
  private healthTimers = new Map<string, ReturnType<typeof setInterval>>();

  start(cmd: DevCommand, env?: Record<string, string> | undefined): void {
    if (this.servers.has(cmd.name)) {
      this.stop(cmd.name);
    }

    const child = spawn(cmd.command, cmd.args, {
      cwd: cmd.cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    const server: RunningServer = {
      command: cmd,
      process: child,
      port: cmd.port ?? null,
      health: "starting",
      logs: [],
    };

    this.servers.set(cmd.name, server);

    const appendLog = (line: string) => {
      server.logs.push(line);
      if (server.logs.length > MAX_LOG_LINES) {
        server.logs.shift();
      }
      this.emit("log", cmd.name, line);

      // Try to detect port from output
      if (!server.port) {
        const match = PORT_REGEX.exec(line);
        if (match?.[1]) {
          server.port = Number.parseInt(match[1], 10);
          this.emit("port-detected", cmd.name, server.port);
        }
      }
    };

    child.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n").filter(Boolean)) {
        appendLog(line);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n").filter(Boolean)) {
        appendLog(line);
      }
    });

    child.on("exit", (code) => {
      clearInterval(this.healthTimers.get(cmd.name));
      this.healthTimers.delete(cmd.name);
      server.health = "unhealthy";
      this.emit("exit", cmd.name, code);
    });

    // Start health checking
    this.startHealthCheck(cmd.name);
  }

  stop(name: string): void {
    const server = this.servers.get(name);
    if (!server) return;

    clearInterval(this.healthTimers.get(name));
    this.healthTimers.delete(name);

    try {
      if (server.process.pid) {
        process.kill(-server.process.pid, "SIGTERM");
      }
    } catch {
      server.process.kill("SIGTERM");
    }

    this.servers.delete(name);
  }

  restart(name: string, env?: Record<string, string> | undefined): void {
    const server = this.servers.get(name);
    if (!server) return;

    const cmd = server.command;
    this.stop(name);
    this.start(cmd, env);
  }

  status(): DevServerStatus[] {
    const result: DevServerStatus[] = [];
    for (const [name, server] of this.servers) {
      result.push({
        name,
        pid: server.process.pid ?? null,
        port: server.port,
        health: server.health,
        type: server.command.type,
      });
    }
    return result;
  }

  getLogs(name: string, limit = 100): string[] {
    const server = this.servers.get(name);
    if (!server) return [];
    return server.logs.slice(-limit);
  }

  stopAll(): void {
    for (const name of this.servers.keys()) {
      this.stop(name);
    }
  }

  private startHealthCheck(name: string): void {
    let retries = 0;

    const timer = setInterval(() => {
      const server = this.servers.get(name);
      if (!server || !server.port) {
        retries++;
        if (retries > HEALTH_CHECK_RETRIES) {
          clearInterval(timer);
        }
        return;
      }

      checkPort(server.port)
        .then((ok) => {
          const wasStarting = server.health === "starting";
          server.health = ok ? "healthy" : "starting";

          if (ok && wasStarting) {
            this.emit("healthy", name, server.port);
          }
        })
        .catch(() => {
          // Ignore check errors
        });
    }, HEALTH_CHECK_INTERVAL);

    this.healthTimers.set(name, timer);
  }
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      resolve(false);
    });

    socket.connect(port, "127.0.0.1");
  });
}

// --- Discovery ---

export function discoverDevCommands(dir: string): DevCommand[] {
  const commands: DevCommand[] = [];

  // package.json
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts ?? {};

      for (const key of ["dev", "start", "serve"]) {
        if (scripts[key]) {
          const type = classifyCommand(scripts[key]);
          commands.push({
            name: key,
            command: "npm",
            args: ["run", key],
            cwd: dir,
            type,
          });
        }
      }
    } catch {
      // Invalid package.json
    }
  }

  // Makefile
  const makefilePath = path.join(dir, "Makefile");
  if (fs.existsSync(makefilePath)) {
    try {
      const content = fs.readFileSync(makefilePath, "utf-8");
      for (const target of ["dev", "serve", "run"]) {
        if (content.includes(`${target}:`)) {
          commands.push({
            name: `make-${target}`,
            command: "make",
            args: [target],
            cwd: dir,
            type: "unknown",
          });
        }
      }
    } catch {
      // Can't read Makefile
    }
  }

  // Cargo.toml
  if (fs.existsSync(path.join(dir, "Cargo.toml"))) {
    commands.push({
      name: "cargo-run",
      command: "cargo",
      args: ["run"],
      cwd: dir,
      type: "backend",
    });
  }

  return commands;
}

export function classifyCommand(script: string): "frontend" | "backend" | "unknown" {
  const lower = script.toLowerCase();
  if (FRONTEND_PATTERNS.some((p) => lower.includes(p))) return "frontend";
  if (lower.includes("uvicorn") || lower.includes("flask") || lower.includes("django"))
    return "backend";
  if (lower.includes("go run") || lower.includes("cargo run")) return "backend";
  return "unknown";
}
