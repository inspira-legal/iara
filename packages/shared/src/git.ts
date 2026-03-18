import { execFile } from "node:child_process";
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

async function gitExec(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  } catch (error: unknown) {
    const err = error as { code?: string; stderr?: string; status?: number | null };
    if (err.code === "ENOENT") {
      throw new GitNotInstalledError();
    }
    throw new GitOperationError(args.join(" "), String(err.stderr ?? ""), err.status ?? null);
  }
}

export async function gitClone(url: string, dest: string): Promise<void> {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const parentDir = path.dirname(dest);
  fs.mkdirSync(parentDir, { recursive: true });
  await gitExec(["clone", url, dest], parentDir);
}

export async function gitWorktreeAdd(
  repoDir: string,
  worktreeDir: string,
  branch: string,
): Promise<void> {
  try {
    // Try creating a new branch
    await gitExec(["worktree", "add", worktreeDir, "-b", branch], repoDir);
  } catch (err) {
    // If branch already exists, attach to it instead
    if (err instanceof GitOperationError && err.stderr.includes("already exists")) {
      await gitExec(["worktree", "add", worktreeDir, branch], repoDir);
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
