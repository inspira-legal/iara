import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AddRepoInput, CloneProgress, RepoInfo } from "@iara/contracts";
import { gitCloneWithProgress, gitFetch, gitPull, gitWorktreeAdd } from "@iara/shared/git";
import type { AppState } from "./state.js";

export async function getRepoInfo(appState: AppState, projectSlug: string): Promise<RepoInfo[]> {
  const repos = appState.discoverRepos(projectSlug);
  const projectDir = appState.getProjectDir(projectSlug);
  const reposDir = path.join(projectDir, "default");

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
    onProgress?.({
      repo: input.name,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
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
 * Pull default branch on all repos in default/ (updates base for new worktrees).
 * Best-effort: skips repos that fail (no upstream, network error, etc).
 */
export async function pullRepos(appState: AppState, projectSlug: string): Promise<void> {
  const repos = appState.discoverRepos(projectSlug);
  const reposDir = path.join(appState.getProjectDir(projectSlug), "default");

  await Promise.all(
    repos.map((name: string) => gitPull(path.join(reposDir, name)).catch(() => {})),
  );
}

/**
 * Fetch origin on all repos in default/ (updates ahead/behind without merging).
 * Best-effort: silently skips failures.
 */
export async function fetchRepos(appState: AppState, projectSlug: string): Promise<void> {
  const repos = appState.discoverRepos(projectSlug);
  const reposDir = path.join(appState.getProjectDir(projectSlug), "default");

  await Promise.all(
    repos.map((name: string) => gitFetch(path.join(reposDir, name)).catch(() => {})),
  );
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
