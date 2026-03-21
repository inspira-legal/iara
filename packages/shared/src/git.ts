import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitNotInstalledError extends Error {
  override readonly name = "GitNotInstalledError";
  constructor() {
    super("git is not installed or not found in PATH");
  }
}

export class GitOperationError extends Error {
  override readonly name = "GitOperationError";
  constructor(
    public readonly command: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
  ) {
    super(`git ${command} failed: ${stderr.trim()}`);
  }
}

export interface GitStatus {
  branch: string;
  dirtyFiles: string[];
}

async function gitExec(
  args: string[],
  cwd: string,
  options?: { timeout?: number },
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: options?.timeout,
    });
    return stdout.trim();
  } catch (error: unknown) {
    const err = error as {
      code?: string;
      stderr?: string;
      status?: number | null;
      killed?: boolean;
    };
    if (err.code === "ENOENT") {
      throw new GitNotInstalledError();
    }
    if (err.killed) {
      throw new GitOperationError(args.join(" "), "timed out", null);
    }
    throw new GitOperationError(args.join(" "), String(err.stderr ?? ""), err.status ?? null);
  }
}

/** Get the remote origin URL for a repo. Returns null if no remote or on error. Sync. */
export function gitRemoteUrlSync(repoDir: string): string | null {
  try {
    return (
      execFileSync("git", ["remote", "get-url", "origin"], {
        cwd: repoDir,
        timeout: 5_000,
        encoding: "utf-8",
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/** Check if a remote URL is reachable. Throws GitOperationError with details if not. */
export async function gitLsRemote(url: string): Promise<void> {
  await gitExec(["ls-remote", "--exit-code", url], process.cwd(), { timeout: 15_000 });
}

export async function gitClone(url: string, dest: string): Promise<void> {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const parentDir = path.dirname(dest);
  fs.mkdirSync(parentDir, { recursive: true });
  await gitExec(["clone", url, dest], parentDir);
}

export async function gitCloneWithProgress(
  url: string,
  dest: string,
  onProgress?: (line: string) => void,
): Promise<void> {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const parentDir = path.dirname(dest);
  fs.mkdirSync(parentDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["clone", "--progress", url, dest], {
      cwd: parentDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrOutput = "";

    // Git writes progress to stderr
    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        stderrOutput += `${text}\n`;
        onProgress?.(text);
      }
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new GitOperationError(`clone ${url}`, stderrOutput.trim() || `exit code ${code}`, code),
        );
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new GitNotInstalledError());
      } else {
        reject(err);
      }
    });
  });
}

export async function gitWorktreeAdd(
  repoDir: string,
  worktreeDir: string,
  branch: string,
): Promise<void> {
  const timeout = 30_000;
  try {
    // Try creating a new branch
    await gitExec(["worktree", "add", worktreeDir, "-b", branch], repoDir, { timeout });
  } catch (err) {
    // If branch already exists, attach to it instead
    if (err instanceof GitOperationError && err.stderr.includes("already exists")) {
      await gitExec(["worktree", "add", worktreeDir, branch], repoDir, { timeout });
    } else {
      throw err;
    }
  }
}

export async function gitWorktreeRemove(repoDir: string, worktreeDir: string): Promise<void> {
  await gitExec(["worktree", "remove", worktreeDir, "--force"], repoDir);
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  const branch = await gitExec(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const statusOutput = await gitExec(["status", "--porcelain"], cwd);
  const dirtyFiles = statusOutput
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3));
  return { branch, dirtyFiles };
}

export async function gitBranchCreate(cwd: string, branch: string): Promise<void> {
  await gitExec(["checkout", "-b", branch], cwd);
}

/** Pull the current branch from origin. No-op if no upstream is configured. 15s timeout. */
export async function gitPull(cwd: string): Promise<void> {
  try {
    await gitExec(["pull", "--ff-only"], cwd, { timeout: 15_000 });
  } catch (err) {
    // No upstream, network error, or timeout — silently skip
    if (err instanceof GitOperationError) {
      if (err.stderr.includes("no tracking information") || err.stderr.includes("timed out")) {
        return;
      }
    }
    throw err;
  }
}

/** Fetch from origin without merging. No-op on network errors. 15s timeout. */
export async function gitFetch(cwd: string): Promise<void> {
  try {
    await gitExec(["fetch", "--quiet"], cwd, { timeout: 15_000 });
  } catch {
    // Network error or timeout — silently skip
  }
}

/** Push to upstream. Throws on failure (no upstream, auth, network). 15s timeout. */
export async function gitPush(cwd: string): Promise<void> {
  await gitExec(["push"], cwd, { timeout: 15_000 });
}
