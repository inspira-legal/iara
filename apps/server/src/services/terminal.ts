import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";
import type { WsPushEvents } from "@iara/contracts";
import * as pty from "node-pty";
import { cleanEnv } from "@iara/shared/env";
import { killProcessGroup } from "@iara/shared/process";
import {
  buildClaudeArgs,
  buildSystemPrompt,
  buildSystemPromptFromDir,
  type LaunchConfig,
  type WorkspaceContext,
} from "./launcher.js";

interface TerminalCreateConfig {
  workspaceId: string;
  workspaceDir: string;
  mode?: "claude" | "shell";
  repoDirs: string[];
  workspaceContext?: WorkspaceContext;
  appendSystemPrompt?: string;
  resumeSessionId?: string;
  pluginDir?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

interface ManagedTerminal {
  id: string;
  workspaceId: string;
  mode: "claude" | "shell";
  sessionId: string;
  initialCwd: string;
  pty: pty.IPty;
  /** Cancels the pending SIGKILL escalation timer, if any. */
  cancelKill: (() => void) | null;
}

/** Grace period before force-killing terminal process groups. */
export const TERMINAL_KILL_GRACE_MS = 500;

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>();
  /** Tracks IDs of terminals that were explicitly destroyed (suppress stale onExit events). */
  private destroyed = new Set<string>();
  private pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

  constructor(pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void) {
    this.pushFn = pushFn;
  }

  create(config: TerminalCreateConfig): { terminalId: string; sessionId: string } {
    const mode = config.mode ?? "claude";

    // Reuse existing terminal for claude mode (one per workspace).
    // Shell mode always creates a new instance (multiple shells per workspace).
    if (mode === "claude") {
      const existing = this.getByWorkspaceId(config.workspaceId, "claude");
      if (existing) {
        return { terminalId: existing.id, sessionId: existing.sessionId };
      }
    }

    const terminalId = crypto.randomUUID();
    const sessionId = config.resumeSessionId ?? crypto.randomUUID();

    const env: Record<string, string> = {
      HOME: process.env.HOME ?? "",
      USER: process.env.USER ?? "",
      SHELL: process.env.SHELL ?? "/bin/bash",
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      ...cleanEnv(process.env),
      ...config.env,
      LANG: process.env.LANG ?? "en_US.UTF-8",
      LC_ALL: process.env.LC_ALL ?? "en_US.UTF-8",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    } as Record<string, string>;

    let command: string;
    let args: string[];

    if (mode === "shell") {
      command = process.env.SHELL ?? "/bin/bash";
      args = [];
      console.log("[terminal] spawn shell", { cwd: config.workspaceDir, command });
    } else {
      const systemPrompt =
        config.appendSystemPrompt ??
        (config.workspaceContext
          ? buildSystemPrompt(config.workspaceContext)
          : buildSystemPromptFromDir(config.workspaceDir));

      const launchConfig: LaunchConfig = {
        workspaceDir: config.workspaceDir,
        repoDirs: config.repoDirs,
        resumeSessionId: config.resumeSessionId,
        sessionId,
        appendSystemPrompt: systemPrompt,
        pluginDir: config.pluginDir ?? process.env.IARA_PLUGIN_DIR,
        env: config.env,
      };

      command = "claude";
      args = buildClaudeArgs(launchConfig);
      env.IARA_SESSION_ID = sessionId;
      console.log("[terminal] spawn claude", { cwd: config.workspaceDir, args });
    }

    const ptyProcess = pty.spawn(command, args, {
      name: "xterm-256color",
      cols: config.cols ?? 80,
      rows: config.rows ?? 24,
      cwd: config.workspaceDir,
      env,
    });

    const managed: ManagedTerminal = {
      id: terminalId,
      workspaceId: config.workspaceId,
      mode,
      sessionId,
      initialCwd: config.workspaceDir,
      pty: ptyProcess,
      cancelKill: null,
    };

    this.terminals.set(terminalId, managed);

    // Buffer initial output for debugging exit errors.
    let outputBuffer = "";
    let bufferActive = true;
    setTimeout(() => {
      bufferActive = false;
      outputBuffer = "";
    }, 5000);

    ptyProcess.onData((data: string) => {
      if (bufferActive) outputBuffer += data;
      this.pushFn("terminal:data", { terminalId, data });
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      if (this.destroyed.has(terminalId)) {
        this.destroyed.delete(terminalId);
        return;
      }

      if (exitCode !== 0) {
        console.error(`[terminal] ${mode} exited with code ${exitCode}`, {
          workspaceId: config.workspaceId,
          cwd: config.workspaceDir,
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
    if (!terminal) return;

    // Mark as destroyed so onExit doesn't push a stale event.
    this.destroyed.add(terminalId);
    this.terminals.delete(terminalId);

    // Kill the entire process group with SIGTERM → SIGKILL escalation.
    const cancelKill = killProcessGroup(terminal.pty.pid, {
      graceMs: TERMINAL_KILL_GRACE_MS,
    });
    terminal.cancelKill = cancelKill;
  }

  destroyByWorkspaceId(workspaceId: string, mode?: "claude" | "shell"): void {
    if (mode) {
      const terminal = this.getByWorkspaceId(workspaceId, mode);
      if (terminal) this.destroy(terminal.id);
    } else {
      // Destroy all terminals for this workspace
      for (const terminal of this.terminals.values()) {
        if (terminal.workspaceId === workspaceId) {
          this.destroy(terminal.id);
        }
      }
    }
  }

  destroyAll(): void {
    for (const [id] of this.terminals.entries()) {
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

  getByWorkspaceId(workspaceId: string, mode?: "claude" | "shell"): ManagedTerminal | undefined {
    for (const terminal of this.terminals.values()) {
      if (terminal.workspaceId === workspaceId && (!mode || terminal.mode === mode)) {
        return terminal;
      }
    }
    return undefined;
  }
}
