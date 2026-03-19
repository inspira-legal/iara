import { spawn, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface LaunchConfig {
  taskDir: string;
  repoDirs: string[];
  sessionId?: string | undefined;
  resumeSessionId?: string | undefined;
  appendSystemPrompt?: string | undefined;
  taskContext?: TaskContext | undefined;
  env?: Record<string, string> | undefined;
}

export interface LaunchResult {
  pid: number | null;
  sessionId: string;
}

/** Context about the task environment, used to build a richer system prompt. */
export interface TaskContext {
  taskDir: string;
  projectName: string;
  taskName: string;
  taskDescription: string;
  branch: string;
  repos: RepoContext[];
}

export interface RepoContext {
  name: string;
  /** Absolute path to this repo's worktree inside the task directory. */
  worktreePath: string;
  /** Absolute path to the main repo in .repos/. */
  mainRepoPath: string;
}

export function buildClaudeArgs(config: LaunchConfig): string[] {
  const args: string[] = ["--dangerously-skip-permissions"];

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

export function buildSystemPrompt(ctx: TaskContext): string {
  const sections: string[] = [];

  // # WORKTREES
  const env = buildEnvironmentSection(ctx);
  if (env) {
    sections.push(
      `# WORKTREES\n${env}\n\nYour working directory is NOT a git repository. All code and git operations must happen inside the worktree directories listed above.`,
    );
  }

  // PROJECT.md and TASK.md — wrapped in tags, only if non-empty
  for (const [file, tag] of [
    ["PROJECT.md", "project"],
    ["TASK.md", "task"],
  ] as const) {
    const filePath = path.join(ctx.taskDir, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content) {
        sections.push(`<${tag}>\n${content}\n</${tag}>`);
      }
    }
  }

  return sections.join("\n\n");
}

function buildEnvironmentSection(ctx: TaskContext): string {
  if (ctx.repos.length === 0) return "";

  const lines = ctx.repos.map(
    (r) => `${r.name}/  ← git worktree (branch: ${ctx.branch}, origem: ${r.mainRepoPath})`,
  );

  return lines.join("\n");
}

/** Fallback: build system prompt from just the task directory (no structured context). */
export function buildSystemPromptFromDir(taskDir: string): string {
  const parts: string[] = [];

  const taskMd = path.join(taskDir, "TASK.md");
  if (fs.existsSync(taskMd)) {
    const content = fs.readFileSync(taskMd, "utf-8").trim();
    if (content) parts.push(content);
  }

  const projectMd = path.join(taskDir, "PROJECT.md");
  if (fs.existsSync(projectMd)) {
    const content = fs.readFileSync(projectMd, "utf-8").trim();
    if (content) parts.push(content);
  }

  return parts.join("\n\n---\n\n");
}

export function launchClaude(config: LaunchConfig): LaunchResult {
  const sessionId = config.resumeSessionId ?? config.sessionId ?? crypto.randomUUID();
  const systemPrompt =
    config.appendSystemPrompt ??
    (config.taskContext
      ? buildSystemPrompt(config.taskContext)
      : buildSystemPromptFromDir(config.taskDir));
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
      execFileSync("which", [t.bin], { stdio: "ignore" });
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
