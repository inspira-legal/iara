import { execFile } from "node:child_process";

/** Vars injected by Electron/iara — never overwrite from the login shell. */
const PROTECTED_PREFIXES = ["IARA_", "ELECTRON_"];
const PROTECTED_KEYS = new Set(["NODE_OPTIONS", "NODE_ENV"]);

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
      resolve(); // Always resolve — fall back to existing env on error
    });
  });
}
