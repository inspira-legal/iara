import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";
import type { WsPushEvents } from "@iara/contracts";
import * as pty from "node-pty";
import {
  buildClaudeArgs,
  buildSystemPrompt,
  buildSystemPromptFromDir,
  type LaunchConfig,
  type TaskContext,
} from "./launcher.js";

/** Pass through all env vars except IARA_ and ELECTRON_ prefixed ones. */
function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !key.startsWith("IARA_") && !key.startsWith("ELECTRON_")) {
      picked[key] = value;
    }
  }
  return picked;
}

export interface TerminalCreateConfig {
  taskId: string;
  taskDir: string;
  repoDirs: string[];
  taskContext?: TaskContext;
  resumeSessionId?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

interface ManagedTerminal {
  id: string;
  taskId: string;
  sessionId: string;
  initialCwd: string;
  pty: pty.IPty;
}

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>();
  private pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

  constructor(pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void) {
    this.pushFn = pushFn;
  }

  create(config: TerminalCreateConfig): { terminalId: string; sessionId: string } {
    // If terminal already exists for this task, return it
    const existing = this.getByTaskId(config.taskId);
    if (existing) {
      return { terminalId: existing.id, sessionId: existing.sessionId };
    }

    const terminalId = crypto.randomUUID();
    const sessionId = config.resumeSessionId ?? crypto.randomUUID();
    const systemPrompt = config.taskContext
      ? buildSystemPrompt(config.taskContext)
      : buildSystemPromptFromDir(config.taskDir);

    const launchConfig: LaunchConfig = {
      taskDir: config.taskDir,
      repoDirs: config.repoDirs,
      resumeSessionId: config.resumeSessionId,
      sessionId,
      appendSystemPrompt: systemPrompt,
      env: config.env,
    };

    const args = buildClaudeArgs(launchConfig);

    const env: Record<string, string> = {
      HOME: process.env.HOME ?? "",
      USER: process.env.USER ?? "",
      SHELL: process.env.SHELL ?? "/bin/bash",
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      ...cleanEnv(process.env),
      ...config.env,
      IARA_SESSION_ID: sessionId,
      LANG: process.env.LANG ?? "en_US.UTF-8",
      LC_ALL: process.env.LC_ALL ?? "en_US.UTF-8",
      TERM: "xterm-256color",
    } as Record<string, string>;

    const shell = process.platform === "win32" ? "cmd.exe" : "bash";
    const shellArgs =
      process.platform === "win32"
        ? ["/c", "claude", ...args]
        : ["-lc", `claude ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`];

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: config.cols ?? 80,
      rows: config.rows ?? 24,
      cwd: config.taskDir,
      env,
    });

    const managed: ManagedTerminal = {
      id: terminalId,
      taskId: config.taskId,
      sessionId,
      initialCwd: config.taskDir,
      pty: ptyProcess,
    };

    this.terminals.set(terminalId, managed);

    ptyProcess.onData((data: string) => {
      this.pushFn("terminal:data", { terminalId, data });
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      this.pushFn("terminal:exit", { terminalId, exitCode });
      this.terminals.delete(terminalId);
    });

    return { terminalId, sessionId };
  }

  write(terminalId: string, data: string): void {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.pty.write(data);
    }
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.pty.resize(cols, rows);
    }
  }

  destroy(terminalId: string): void {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.pty.kill();
      this.terminals.delete(terminalId);
    }
  }

  destroyByTaskId(taskId: string): void {
    const terminal = this.getByTaskId(taskId);
    if (terminal) {
      this.destroy(terminal.id);
    }
  }

  destroyAll(): void {
    for (const [id] of this.terminals) {
      this.destroy(id);
    }
  }

  async getCwd(terminalId: string): Promise<string | null> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return null;

    const pid = terminal.pty.pid;
    try {
      if (process.platform === "linux") {
        return await fs.readlink(`/proc/${pid}/cwd`);
      }
      if (process.platform === "darwin") {
        const { stdout } = await promisify(execFile)("lsof", ["-p", String(pid), "-Fn"], {
          timeout: 2000,
        });
        const cwdLine = stdout.split("\n").find((l) => l.startsWith("fcwd"));
        if (cwdLine) {
          // Next line is the path prefixed with "n"
          const idx = stdout.indexOf(cwdLine);
          const rest = stdout.slice(idx + cwdLine.length + 1);
          const pathLine = rest.split("\n").find((l) => l.startsWith("n"));
          if (pathLine) return pathLine.slice(1);
        }
      }
    } catch {
      // Process may have exited or command unavailable
    }

    return terminal.initialCwd;
  }

  getByTaskId(taskId: string): ManagedTerminal | undefined {
    for (const terminal of this.terminals.values()) {
      if (terminal.taskId === taskId) {
        return terminal;
      }
    }
    return undefined;
  }
}
