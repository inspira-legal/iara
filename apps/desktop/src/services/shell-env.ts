import { execFileSync } from "node:child_process";

export function syncShellEnvironment(): void {
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
