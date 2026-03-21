import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AddRepoInput, CloneProgress, RepoInfo, SyncResult } from "@iara/contracts";
import {
  GitOperationError,
  gitCloneWithProgress,
  gitFetch,
  gitLsRemote,
  gitPull,
  gitPush,
  gitWorktreeAdd,
} from "@iara/shared/git";
import type { AppState } from "./state.js";

function friendlyGitError(err: unknown): string {
  if (err instanceof GitOperationError && err.exitCode === 128) {
    const s = err.stderr.toLowerCase();
    if (
      s.includes("could not read") ||
      s.includes("authentication") ||
      s.includes("permission denied")
    )
      return "Authentication failed. Check your credentials or SSH key.";
    if (
      s.includes("not found") ||
      s.includes("does not exist") ||
      s.includes("not appear to be a git repo")
    )
      return "Repository not found. Check the URL and try again.";
    if (s.includes("already exists")) return "Destination directory already exists.";
    return `Could not access repository: ${err.stderr.split("\n")[0]}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Validate a git URL is reachable. Throws a friendly error if not. */
export async function validateGitUrl(url: string): Promise<void> {
  try {
    await gitLsRemote(url);
  } catch (err) {
    throw new Error(friendlyGitError(err), { cause: err });
  }
}

export async function getRepoInfo(
  appState: AppState,
  projectSlug: string,
  workspaceSlug?: string,
): Promise<RepoInfo[]> {
  const repos = appState.discoverRepos(projectSlug);
  const reposDir = resolveReposDir(appState, projectSlug, workspaceSlug);

  return repos.map((name: string) => {
    const repoPath = path.join(reposDir, name);
    const { ahead, behind } = getGitAheadBehind(repoPath);
    return {
      name,
      branch: getGitBranch(repoPath),
      dirtyCount: getGitDirtyCount(repoPath),
      ahead,
      behind,
    };
  });
}

export async function addRepo(
  appState: AppState,
  projectId: string,
  projectSlug: string,
  input: AddRepoInput,
  onProgress?: (progress: CloneProgress) => void,
): Promise<void> {
  const projectDir = appState.getProjectDir(projectSlug);
  const reposDir = path.join(projectDir, "default");
  fs.mkdirSync(reposDir, { recursive: true });
  const dest = path.join(reposDir, input.name);

  if (fs.existsSync(dest)) {
    throw new Error(`Repo "${input.name}" already exists in this project`);
  }

  const cleanup = () => {
    try {
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  };

  try {
    switch (input.method) {
      case "git-url": {
        if (!input.url) throw new Error("URL is required for git-url method");
        onProgress?.({ repo: input.name, status: "started" });
        await gitCloneWithProgress(input.url, dest, (message) => {
          onProgress?.({ repo: input.name, status: "progress", message });
        });
        onProgress?.({ repo: input.name, status: "done" });
        break;
      }
      case "local-folder": {
        if (!input.folderPath) throw new Error("Folder path is required for local-folder method");
        onProgress?.({ repo: input.name, status: "started", message: "Copying folder..." });
        fs.cpSync(input.folderPath, dest, { recursive: true });
        if (!fs.existsSync(path.join(dest, ".git"))) {
          onProgress?.({ repo: input.name, status: "progress", message: "Initializing git..." });
          execSync("git init", { cwd: dest, stdio: "pipe" });
        }
        onProgress?.({ repo: input.name, status: "done" });
        break;
      }
      case "empty": {
        onProgress?.({ repo: input.name, status: "started", message: "Creating repo..." });
        fs.mkdirSync(dest, { recursive: true });
        execSync("git init", { cwd: dest, stdio: "pipe" });
        onProgress?.({ repo: input.name, status: "done" });
        break;
      }
    }
  } catch (err) {
    cleanup();
    const message = friendlyGitError(err);
    onProgress?.({ repo: input.name, status: "error", error: message });
    throw new Error(message, { cause: err });
  }

  // Create worktrees for active workspaces
  const project = appState.getProject(projectSlug);
  const workspaces = project?.workspaces ?? [];
  for (const ws of workspaces) {
    if (ws.slug === "default") continue;
    const wsDir = path.join(projectDir, ws.slug);
    const wtDir = path.join(wsDir, input.name);
    if (fs.existsSync(wsDir) && !fs.existsSync(wtDir) && ws.branch) {
      try {
        await gitWorktreeAdd(dest, wtDir, ws.branch);
      } catch {
        // Best effort — branch may not exist yet
      }
    }
  }
}

/**
 * Sync all repos in default/: pull (ff-only) then push.
 * Returns per-repo results so the UI can show what happened.
 */
export async function syncRepos(
  appState: AppState,
  projectSlug: string,
  workspaceSlug?: string,
): Promise<SyncResult[]> {
  const repos = appState.discoverRepos(projectSlug);
  const reposDir = resolveReposDir(appState, projectSlug, workspaceSlug);

  return Promise.all(
    repos.map(async (name: string): Promise<SyncResult> => {
      const repoPath = path.join(reposDir, name);
      try {
        await gitPull(repoPath);
        await gitPush(repoPath).catch(() => {
          // Push may fail (no upstream, nothing to push) — not fatal
        });
        return { repo: name, status: "ok" };
      } catch (err) {
        return {
          repo: name,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}

/**
 * Fetch origin on all repos in default/ (updates ahead/behind without merging).
 * Best-effort: silently skips failures.
 */
export async function fetchRepos(
  appState: AppState,
  projectSlug: string,
  workspaceSlug?: string,
): Promise<void> {
  const repos = appState.discoverRepos(projectSlug);
  const reposDir = resolveReposDir(appState, projectSlug, workspaceSlug);

  await Promise.all(
    repos.map((name: string) => gitFetch(path.join(reposDir, name)).catch(() => {})),
  );
}

/** Resolve the directory containing repos for a workspace (default/ or task slug). */
function resolveReposDir(appState: AppState, projectSlug: string, workspaceSlug?: string): string {
  const projectDir = appState.getProjectDir(projectSlug);
  return path.join(projectDir, workspaceSlug ?? "default");
}

function getGitBranch(repoPath: string): string {
  try {
    return (
      execSync("git branch --show-current", {
        cwd: repoPath,
        stdio: "pipe",
      })
        .toString()
        .trim() || "HEAD"
    );
  } catch {
    return "unknown";
  }
}

function getGitDirtyCount(repoPath: string): number {
  try {
    const output = execSync("git status --porcelain", {
      cwd: repoPath,
      stdio: "pipe",
    })
      .toString()
      .trim();
    return output ? output.split("\n").length : 0;
  } catch {
    return 0;
  }
}

function getGitAheadBehind(repoPath: string): {
  ahead: number;
  behind: number;
} {
  try {
    const output = execSync("git rev-list --left-right --count HEAD...@{upstream}", {
      cwd: repoPath,
      stdio: "pipe",
    })
      .toString()
      .trim();
    const [ahead, behind] = output.split("\t").map(Number);
    return { ahead: ahead || 0, behind: behind || 0 };
  } catch {
    // No upstream configured
    return { ahead: 0, behind: 0 };
  }
}
