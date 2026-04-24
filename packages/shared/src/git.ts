import * as fs from "node:fs";
import * as path from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";
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

interface GitStatus {
  branch: string;
  dirtyFiles: string[];
}

function wrapGitError(err: unknown, command: string): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ENOENT") || msg.includes("git is not installed")) {
    throw new GitNotInstalledError();
  }
  throw new GitOperationError(command, msg, null);
}

// ---------------------------------------------------------------------------
// Git execution
// ---------------------------------------------------------------------------

/** Execute a git command asynchronously. */
export async function execGitAsync(
  args: string[],
  opts: { cwd?: string; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  const timeout = opts.timeout ?? 30_000;
  try {
    return await execFileAsync("git", args, {
      cwd: opts.cwd,
      timeout,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new GitNotInstalledError();
    throw err;
  }
}

/** Execute a git command synchronously. */
export function execGitSync(args: string[], opts: { cwd?: string; timeout?: number } = {}): string {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const timeout = opts.timeout ?? 5_000;
  return execFileSync("git", args, {
    cwd: opts.cwd,
    timeout,
    encoding: "utf-8",
  });
}

/** Spawn a git process. Returns the ChildProcess for streaming stdout/stderr. */
function spawnGit(args: string[], opts?: { cwd?: string }): ChildProcess {
  return spawn("git", args, {
    cwd: opts?.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// ---------------------------------------------------------------------------
// Git operations
// ---------------------------------------------------------------------------

/** Get the remote origin URL for a repo. Returns null if no remote or on error. Sync. */
export function gitRemoteUrlSync(repoDir: string): string | null {
  try {
    return execGitSync(["-C", repoDir, "remote", "get-url", "origin"]).trim() || null;
  } catch {
    return null;
  }
}

/** Check if a remote URL is reachable. Throws GitOperationError with details if not. */
export async function gitLsRemote(url: string): Promise<void> {
  try {
    await execGitAsync(["ls-remote", url]);
  } catch (err) {
    wrapGitError(err, `ls-remote ${url}`);
  }
}

export async function gitInit(dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  try {
    await execGitAsync(["init", dest]);
  } catch (err) {
    wrapGitError(err, `init ${dest}`);
  }
}

export async function gitClone(url: string, dest: string): Promise<void> {
  const parentDir = path.dirname(dest);
  fs.mkdirSync(parentDir, { recursive: true });
  try {
    await execGitAsync(["clone", url, dest]);
  } catch (err) {
    wrapGitError(err, `clone ${url}`);
  }
}

export async function gitCloneWithProgress(
  url: string,
  dest: string,
  onProgress?: (line: string) => void,
): Promise<void> {
  const parentDir = path.dirname(dest);
  fs.mkdirSync(parentDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawnGit(["clone", "--progress", url, dest], { cwd: parentDir });

    let stderrOutput = "";

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
  const cRepoDir = repoDir;
  const cWorktreeDir = worktreeDir;
  try {
    await execGitAsync(["-C", cRepoDir, "worktree", "add", cWorktreeDir, "-b", branch]);
  } catch (err) {
    if (String(err).includes("already exists")) {
      try {
        await execGitAsync(["-C", cRepoDir, "worktree", "add", cWorktreeDir, branch]);
      } catch (err2) {
        wrapGitError(err2, `worktree add ${branch}`);
      }
    } else {
      wrapGitError(err, `worktree add -b ${branch}`);
    }
  }
}

export async function gitWorktreeRemove(repoDir: string, worktreeDir: string): Promise<void> {
  try {
    await execGitAsync(["-C", repoDir, "worktree", "remove", worktreeDir, "--force"]);
  } catch (err) {
    wrapGitError(err, `worktree remove ${worktreeDir}`);
  }
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  try {
    const { stdout } = await execGitAsync(["-C", cwd, "status", "--porcelain", "-b"]);
    const lines = stdout.trim().split("\n").filter(Boolean);
    let branch = "HEAD";
    const dirtyFiles: string[] = [];

    for (const line of lines) {
      if (line.startsWith("## ")) {
        // ## branch...tracking
        const branchPart = line.slice(3).split("...")[0];
        if (branchPart) branch = branchPart;
      } else {
        // Porcelain status line: XY filename
        const file = line.slice(3);
        if (file) dirtyFiles.push(file);
      }
    }

    return { branch, dirtyFiles };
  } catch (err) {
    wrapGitError(err, "status");
  }
}

export async function gitBranchCreate(cwd: string, branch: string): Promise<void> {
  try {
    await execGitAsync(["-C", cwd, "checkout", "-b", branch]);
  } catch (err) {
    wrapGitError(err, `checkout -b ${branch}`);
  }
}

/** Pull the current branch from origin. No-op if no upstream is configured. 15s timeout. */
export async function gitPull(cwd: string): Promise<void> {
  try {
    await execGitAsync(["-C", cwd, "pull", "--ff-only"], { timeout: 15_000 });
  } catch (err) {
    const msg = String(err);
    if (
      msg.includes("no tracking information") ||
      msg.includes("timed out") ||
      msg.includes("There is no tracking information") ||
      msg.includes("does not have a commit checked out") ||
      msg.includes("no such remote")
    ) {
      return;
    }
    wrapGitError(err, "pull --ff-only");
  }
}

/** Fetch from origin without merging. No-op on network errors. 15s timeout. */
export async function gitFetch(cwd: string): Promise<void> {
  try {
    await execGitAsync(["-C", cwd, "fetch", "--quiet"], { timeout: 15_000 });
  } catch {
    // Network error or timeout — silently skip
  }
}

/** Push to upstream. Throws on failure (no upstream, auth, network). 15s timeout. */
export async function gitPush(cwd: string): Promise<void> {
  try {
    await execGitAsync(["-C", cwd, "push"], { timeout: 15_000 });
  } catch (err) {
    wrapGitError(err, "push");
  }
}
