import { execFile } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

/** Vars injected by Electron/iara — never overwrite from the login shell. */
const PROTECTED_PREFIXES = ["IARA_", "ELECTRON_"];
const PROTECTED_KEYS = new Set(["NODE_OPTIONS", "NODE_ENV"]);

/**
 * Common user-install directories that aren't in any system path but are where
 * CLIs like `claude`, `pip --user` installs, `npm --global` (user prefix), and
 * homebrew end up. Appended to PATH after the login shell sync so that a
 * terminal emulator's custom injection (or a CLI installer's `.local/bin` drop)
 * is still reachable from packaged builds.
 */
function userBinFallbacks(): string[] {
  const home = os.homedir();
  const paths = [
    path.join(home, ".local/bin"),
    path.join(home, ".claude/local"),
    path.join(home, ".npm-global/bin"),
    path.join(home, "bin"),
  ];
  if (process.platform === "darwin") {
    paths.push("/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin");
  }
  return paths;
}

function isProtected(key: string): boolean {
  return PROTECTED_KEYS.has(key) || PROTECTED_PREFIXES.some((p) => key.startsWith(p));
}

function applyShellOutput(output: string): void {
  for (const line of output.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);
    if (isProtected(key)) continue;
    if (value) {
      process.env[key] = value;
    }
  }
}

function appendMissingPathEntries(): void {
  const current = process.env.PATH ?? "";
  const existing = new Set(current.split(path.delimiter).filter(Boolean));
  const additions = userBinFallbacks().filter((p) => !existing.has(p));
  if (additions.length === 0) return;
  process.env.PATH = current
    ? `${current}${path.delimiter}${additions.join(path.delimiter)}`
    : additions.join(path.delimiter);
}

/**
 * Import the full user environment from their login shell (async).
 * Required on macOS (Electron doesn't inherit login shell env) and
 * Linux when launched from .desktop files / AppImages / nested terminals.
 *
 * Overwrites process.env with login-shell values EXCEPT vars injected
 * by Electron/iara (IARA_*, ELECTRON_*, NODE_OPTIONS, NODE_ENV).
 */
export function syncShellEnvironment(): Promise<void> {
  if (process.platform === "win32") return Promise.resolve();

  return new Promise((resolve) => {
    const shell = process.env.SHELL ?? "/bin/bash";
    execFile(shell, ["-ilc", "env"], { encoding: "utf-8", timeout: 5000 }, (err, stdout) => {
      if (!err && stdout) {
        applyShellOutput(stdout);
      }
      appendMissingPathEntries();
      resolve(); // Always resolve — fall back to existing env on error
    });
  });
}
