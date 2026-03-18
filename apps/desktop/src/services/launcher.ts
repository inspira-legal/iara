import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface LaunchConfig {
  taskDir: string;
  repoDirs: string[];
  sessionId?: string | undefined;
  resumeSessionId?: string | undefined;
  appendSystemPrompt?: string | undefined;
  env?: Record<string, string> | undefined;
}

export interface LaunchResult {
  pid: number | null;
  sessionId: string;
}

export function buildClaudeArgs(config: LaunchConfig): string[] {
  const args: string[] = [];

  // Session handling
  if (config.resumeSessionId) {
    args.push("--resume", config.resumeSessionId);
  } else if (config.sessionId) {
    args.push("--session-id", config.sessionId);
  }

  // Add repo dirs
  for (const dir of config.repoDirs) {
    args.push("--add-dir", dir);
  }

  // System prompt
  if (config.appendSystemPrompt) {
    args.push("--append-system-prompt", config.appendSystemPrompt);
  }

  return args;
}

export function buildSystemPrompt(taskDir: string): string {
  const parts: string[] = [];

  const taskMd = path.join(taskDir, "TASK.md");
  if (fs.existsSync(taskMd)) {
    parts.push(fs.readFileSync(taskMd, "utf-8"));
  }

  const projectMd = path.join(taskDir, "PROJECT.md");
  if (fs.existsSync(projectMd)) {
    parts.push(fs.readFileSync(projectMd, "utf-8"));
  }

  return parts.join("\n\n---\n\n");
}

export function launchClaude(config: LaunchConfig): LaunchResult {
  const sessionId = config.resumeSessionId ?? config.sessionId ?? crypto.randomUUID();
  const systemPrompt = config.appendSystemPrompt ?? buildSystemPrompt(config.taskDir);
  const args = buildClaudeArgs({ ...config, sessionId, appendSystemPrompt: systemPrompt });

  const env: Record<string, string> = {
    ...process.env,
    ...config.env,
    IARA_SESSION_ID: sessionId,
  } as Record<string, string>;

  const terminalCmd = getTerminalCommand(args, config.taskDir, env);
  const child = spawn(terminalCmd.command, terminalCmd.args, {
    detached: true,
    stdio: "ignore",
    cwd: config.taskDir,
    env,
  });

  child.unref();

  return { pid: child.pid ?? null, sessionId };
}

interface TerminalCommand {
  command: string;
  args: string[];
}

function getTerminalCommand(
  claudeArgs: string[],
  cwd: string,
  env: Record<string, string>,
): TerminalCommand {
  const claudeCmd = `cd ${shellEscape(cwd)} && claude ${claudeArgs.map(shellEscape).join(" ")}`;

  if (process.platform === "darwin") {
    return getMacTerminal(claudeCmd, env);
  }

  if (process.platform === "win32") {
    return {
      command: "wt.exe",
      args: ["-d", cwd, "cmd", "/c", `claude ${claudeArgs.join(" ")}`],
    };
  }

  // Linux: try common terminals
  return getLinuxTerminal(claudeCmd);
}

function getMacTerminal(cmd: string, env: Record<string, string>): TerminalCommand {
  // Check for popular terminals
  const terminals = [
    { app: "Ghostty", check: "/Applications/Ghostty.app" },
    { app: "iTerm", check: "/Applications/iTerm.app" },
    { app: "Warp", check: "/Applications/Warp.app" },
  ];

  for (const t of terminals) {
    if (fs.existsSync(t.check)) {
      // Use osascript to open in the specific terminal
      const envExports = Object.entries(env)
        .filter(([k]) => k.startsWith("IARA_"))
        .map(([k, v]) => `export ${k}=${shellEscape(v)}`)
        .join("; ");
      const fullCmd = envExports ? `${envExports}; ${cmd}` : cmd;

      return {
        command: "osascript",
        args: [
          "-e",
          `tell application "${t.app}" to activate`,
          "-e",
          `tell application "System Events" to tell process "${t.app}" to keystroke "t" using command down`,
          "-e",
          `delay 0.5`,
          "-e",
          `tell application "System Events" to keystroke "${fullCmd}\n"`,
        ],
      };
    }
  }

  // Fallback: default Terminal.app
  return {
    command: "open",
    args: ["-a", "Terminal", cmd],
  };
}

function getLinuxTerminal(cmd: string): TerminalCommand {
  const terminals = [
    { bin: "ghostty", args: ["-e", "sh", "-c", cmd] },
    { bin: "kitty", args: ["sh", "-c", cmd] },
    { bin: "alacritty", args: ["-e", "sh", "-c", cmd] },
    { bin: "gnome-terminal", args: ["--", "sh", "-c", cmd] },
    { bin: "konsole", args: ["-e", "sh", "-c", cmd] },
    { bin: "xterm", args: ["-e", cmd] },
  ];

  for (const t of terminals) {
    try {
      require("node:child_process").execFileSync("which", [t.bin], { stdio: "ignore" });
      return { command: t.bin, args: t.args };
    } catch {
      continue;
    }
  }

  // Fallback
  return { command: "xterm", args: ["-e", cmd] };
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
