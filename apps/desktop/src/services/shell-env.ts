import { execFileSync } from "node:child_process";

/**
 * Import the login-shell PATH into process.env.PATH.
 *
 * Scope is deliberately narrow (PATH only, synchronous): runs before
 * `app.whenReady()` to ensure any child process Electron spawns inherits the
 * user's shell PATH. For full environment import in a non-blocking context
 * see `apps/server/src/services/shell-env.ts` (`syncShellEnvironment`).
 */
export function syncShellPath(): void {
  if (process.platform !== "darwin") return;

  try {
    const shell = process.env.SHELL ?? "/bin/zsh";
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
