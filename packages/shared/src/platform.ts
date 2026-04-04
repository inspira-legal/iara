import type { ChildProcess } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import crossSpawn from "cross-spawn";
import defaultShell from "default-shell";
import treeKill from "tree-kill";
import which from "which";

export const isWindows = process.platform === "win32";
const isMacOS = process.platform === "darwin";

// ---------------------------------------------------------------------------
// State directory
// ---------------------------------------------------------------------------

/** Platform-appropriate state directory (LOCALAPPDATA on Windows, ~/Library/Application Support on macOS, ~/.config on Linux). */
export function getStateDir(appName: string): string {
  if (isWindows) {
    const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(base, appName);
  }
  if (isMacOS) {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  return path.join(os.homedir(), ".config", appName);
}

// ---------------------------------------------------------------------------
// Command existence check
// ---------------------------------------------------------------------------

/** Check whether a command exists on the system PATH. */
export function commandExists(cmd: string): boolean {
  return which.sync(cmd, { nothrow: true }) !== null;
}

// ---------------------------------------------------------------------------
// Shell resolution
// ---------------------------------------------------------------------------

/** Escape a single argument for embedding in a shell command string. */
export function shellQuote(arg: string): string {
  if (arg === "") return "''";
  if (/^[a-zA-Z0-9_./:=@,+-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** Build an interactive login shell as `{ command, args }` — for PTY sessions. */
export function buildInteractiveShell(): { command: string; args: string[] } {
  return { command: defaultShell, args: ["--login"] };
}

/** Build a shell command wrapped in the user's login shell (`$SHELL -lc "cmd"`) as `{ command, args }`. */
export function buildShellCommand(cmd: string): { command: string; args: string[] } {
  return { command: defaultShell, args: ["-lc", cmd] };
}

/**
 * Spawn a command inside the user's login shell (`$SHELL -lc "cmd"`).
 * Returns a ChildProcess augmented with `killTree()` for process-tree cleanup.
 */
export function spawnWithLoginShell(
  cmd: string,
  opts: { cwd?: string; env?: Record<string, string>; stdio?: any },
): ChildProcess & { killTree: (graceMs?: number) => () => void } {
  const { command, args } = buildShellCommand(cmd);
  const child = crossSpawn(command, args, {
    ...opts,
    detached: true,
  });
  return Object.assign(child, {
    killTree: (graceMs?: number) =>
      killProcessTree(child.pid!, graceMs != null ? { graceMs } : undefined),
  });
}

// ---------------------------------------------------------------------------
// Terminal environment
// ---------------------------------------------------------------------------

/** Build platform-appropriate base environment variables for terminal processes. */
export function buildTerminalEnv(overrides?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {
    HOME: process.env.HOME ?? "",
    USER: process.env.USER ?? "",
    SHELL: defaultShell,
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
  };
  // Only set locale vars if they exist in the environment — avoid setting
  // en_US.UTF-8 when the locale isn't installed (common in minimal WSL setups).
  if (process.env.LANG) base.LANG = process.env.LANG;
  if (process.env.LC_ALL) base.LC_ALL = process.env.LC_ALL;

  return { ...base, ...overrides, TERM: "xterm-256color", COLORTERM: "truecolor" };
}

// ---------------------------------------------------------------------------
// Process CWD detection
// ---------------------------------------------------------------------------

/** Get the current working directory of a process by PID. Returns null if unavailable. */
export async function getProcessCwd(pid: number): Promise<string | null> {
  try {
    if (process.platform === "linux") {
      const fs = await import("node:fs/promises");
      return await fs.readlink(`/proc/${pid}/cwd`);
    }
    if (isMacOS) {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { stdout } = await promisify(execFile)("lsof", ["-p", String(pid), "-Fn"], {
        timeout: 2000,
      });
      const cwdLine = stdout.split("\n").find((l) => l.startsWith("fcwd"));
      if (cwdLine) {
        const idx = stdout.indexOf(cwdLine);
        const rest = stdout.slice(idx + cwdLine.length + 1);
        const pathLine = rest.split("\n").find((l) => l.startsWith("n"));
        if (pathLine) return pathLine.slice(1);
      }
    }
  } catch {
    // Process may have exited
  }
  return null;
}

// ---------------------------------------------------------------------------
// Process tree killing
// ---------------------------------------------------------------------------

/**
 * Kill an entire process tree by PID using `tree-kill`.
 * SIGTERM -> SIGKILL escalation after graceMs.
 * Returns a cleanup function that cancels the pending SIGKILL timer.
 */
export function killProcessTree(pid: number, opts?: { graceMs?: number }): () => void {
  try {
    treeKill(pid, "SIGTERM");
  } catch {
    return () => {};
  }

  const graceMs = opts?.graceMs ?? 3000;
  const timer = setTimeout(() => {
    try {
      treeKill(pid, "SIGKILL");
    } catch {
      // Already dead
    }
  }, graceMs);

  return () => clearTimeout(timer);
}
