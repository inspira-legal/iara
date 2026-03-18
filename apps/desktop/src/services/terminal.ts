import type { BrowserWindow } from "electron";
import * as pty from "node-pty";
import { buildClaudeArgs, buildSystemPrompt, type LaunchConfig } from "./launcher.js";

export interface TerminalCreateConfig {
  taskId: string;
  taskDir: string;
  repoDirs: string[];
  resumeSessionId?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

interface ManagedTerminal {
  id: string;
  taskId: string;
  sessionId: string;
  pty: pty.IPty;
}

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>();
  private mainWindow: BrowserWindow | null = null;

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  create(config: TerminalCreateConfig): { terminalId: string; sessionId: string } {
    // If terminal already exists for this task, return it
    const existing = this.getByTaskId(config.taskId);
    if (existing) {
      return { terminalId: existing.id, sessionId: existing.sessionId };
    }

    const terminalId = crypto.randomUUID();
    const sessionId = config.resumeSessionId ?? crypto.randomUUID();
    const systemPrompt = buildSystemPrompt(config.taskDir);

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
      ...process.env,
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
        : ["-c", `claude ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`];

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
      pty: ptyProcess,
    };

    this.terminals.set(terminalId, managed);

    ptyProcess.onData((data: string) => {
      this.mainWindow?.webContents.send("terminal:data", terminalId, data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      this.mainWindow?.webContents.send("terminal:exit", terminalId, exitCode);
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

  getByTaskId(taskId: string): ManagedTerminal | undefined {
    for (const terminal of this.terminals.values()) {
      if (terminal.taskId === taskId) {
        return terminal;
      }
    }
    return undefined;
  }
}
