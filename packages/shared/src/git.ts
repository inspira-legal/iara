import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { simpleGit, type SimpleGit } from "simple-git";

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

function wrapGitError(err: unknown, command: string): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ENOENT") || msg.includes("git is not installed")) {
    throw new GitNotInstalledError();
  }
  throw new GitOperationError(command, msg, null);
}

function git(cwd?: string): SimpleGit {
  if (cwd) return simpleGit(cwd);
  return simpleGit();
}

/** Get the remote origin URL for a repo. Returns null if no remote or on error. Sync. */
export function gitRemoteUrlSync(repoDir: string): string | null {
  try {
    const { execFileSync } = require("node:child_process");
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
  try {
    await git().listRemote([url]);
  } catch (err) {
    wrapGitError(err, `ls-remote ${url}`);
  }
}

export async function gitClone(url: string, dest: string): Promise<void> {
  const parentDir = path.dirname(dest);
  fs.mkdirSync(parentDir, { recursive: true });
  try {
    await git().clone(url, dest);
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
    const proc = spawn("git", ["clone", "--progress", url, dest], {
      cwd: parentDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

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
  const g = git(repoDir);
  try {
    // Try creating a new branch
    await g.raw(["worktree", "add", worktreeDir, "-b", branch]);
  } catch (err) {
    // If branch already exists, attach to it instead
    if (String(err).includes("already exists")) {
      try {
        await g.raw(["worktree", "add", worktreeDir, branch]);
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
    await git(repoDir).raw(["worktree", "remove", worktreeDir, "--force"]);
  } catch (err) {
    wrapGitError(err, `worktree remove ${worktreeDir}`);
  }
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  try {
    const g = git(cwd);
    const status = await g.status();
    return {
      branch: status.current ?? "HEAD",
      dirtyFiles: status.files.map((f) => f.path),
    };
  } catch (err) {
    wrapGitError(err, "status");
  }
}

export async function gitBranchCreate(cwd: string, branch: string): Promise<void> {
  try {
    await git(cwd).checkoutLocalBranch(branch);
  } catch (err) {
    wrapGitError(err, `checkout -b ${branch}`);
  }
}

/** Pull the current branch from origin. No-op if no upstream is configured. 15s timeout. */
export async function gitPull(cwd: string): Promise<void> {
  try {
    await git(cwd).pull(["--ff-only"]);
  } catch (err) {
    const msg = String(err);
    // No upstream, no remote, or timeout — silently skip
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
    await git(cwd).fetch(["--quiet"]);
  } catch {
    // Network error or timeout — silently skip
  }
}

/** Push to upstream. Throws on failure (no upstream, auth, network). 15s timeout. */
export async function gitPush(cwd: string): Promise<void> {
  try {
    await git(cwd).push();
  } catch (err) {
    wrapGitError(err, "push");
  }
}
