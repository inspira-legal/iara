import { execFileSync } from "node:child_process";

/**
 * Import PATH from the user's login shell.
 * Required on macOS (Electron doesn't inherit login shell env) and
 * Linux when launched from .desktop files / AppImages.
 */
export function syncShellEnvironment(): void {
  if (process.platform === "win32") return;

  try {
    const shell = process.env.SHELL ?? "/bin/bash";
    const output = execFileSync(shell, ["-ilc", "echo $PATH"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const shellPath = output.trim();
    if (shellPath) {
      process.env.PATH = shellPath;
    }
  } catch {
    // Fall back to existing PATH
  }
}
