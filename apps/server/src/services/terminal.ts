import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";
import type { WsPushEvents } from "@iara/contracts";
import * as pty from "node-pty";
import { cleanEnv } from "@iara/shared/env";
import {
  buildClaudeArgs,
  buildSystemPrompt,
  buildSystemPromptFromDir,
  type LaunchConfig,
  type TaskContext,
} from "./launcher.js";

export interface TerminalCreateConfig {
  taskId: string;
  taskDir: string;
  repoDirs: string[];
  taskContext?: TaskContext;
  appendSystemPrompt?: string;
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

/** Grace period before force-killing terminal process groups. */
export const TERMINAL_KILL_GRACE_MS = 500;

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>();
  private killTimer: ReturnType<typeof setTimeout> | null = null;
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
    const systemPrompt =
      config.appendSystemPrompt ??
      (config.taskContext
        ? buildSystemPrompt(config.taskContext)
        : buildSystemPromptFromDir(config.taskDir));

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
      COLORTERM: "truecolor",
    } as Record<string, string>;

    console.log("[terminal] spawn claude", { cwd: config.taskDir, args });

    const ptyProcess = pty.spawn("claude", args, {
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

    // Buffer initial output for debugging exit errors
    let outputBuffer = "";
    const bufferTimeout = setTimeout(() => {
      outputBuffer = "";
    }, 5000);

    ptyProcess.onData((data: string) => {
      if (outputBuffer !== "") outputBuffer += data;
      else if (bufferTimeout) outputBuffer = data;
      this.pushFn("terminal:data", { terminalId, data });
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      clearTimeout(bufferTimeout);
      if (exitCode !== 0) {
        console.error(`[terminal] claude exited with code ${exitCode}`, {
          taskId: config.taskId,
          cwd: config.taskDir,
          output: outputBuffer.slice(0, 2000),
        });
      }
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
      // Remove from map first so the onExit handler (which also deletes)
      // becomes a no-op and doesn't push a stale "terminal:exit" event.
      this.terminals.delete(terminalId);

      // Kill the entire process group so subprocesses (subagents, bash, etc.)
      // also receive the signal. Negative PID = process group.
      try {
        process.kill(-terminal.pty.pid, "SIGTERM");
      } catch {
        /* already dead or no process group — fall back to pty.kill() */
        terminal.pty.kill();
      }
    }
  }

  destroyByTaskId(taskId: string): void {
    const terminal = this.getByTaskId(taskId);
    if (terminal) {
      this.destroy(terminal.id);
    }
  }

  destroyAll(): void {
    // Collect PIDs and IDs before destroying to avoid mutating the Map
    // during iteration (destroy() deletes from the map).
    const entries = [...this.terminals.entries()];
    const pids = entries.map(([, t]) => t.pty.pid);

    for (const [id] of entries) {
      this.destroy(id);
    }

    // Cancel any previous force-kill timer to avoid duplicate SIGKILL rounds.
    if (this.killTimer) clearTimeout(this.killTimer);

    // Force-kill any surviving process groups after a short grace period.
    if (pids.length > 0) {
      this.killTimer = setTimeout(() => {
        this.killTimer = null;
        for (const pid of pids) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            /* already dead */
          }
        }
      }, TERMINAL_KILL_GRACE_MS);
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
