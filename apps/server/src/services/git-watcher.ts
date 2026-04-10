import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoInfo } from "@iara/contracts";
import type { PushPatchFn } from "../types.js";
import type { AppState } from "./state.js";
import { getRepoInfo } from "./repos.js";

/**
 * Watches .git/index and .git/HEAD in every repo (project root + workspaces)
 * to detect branch switches, commits, stages, fetches, etc.
 *
 * On change, computes fresh RepoInfo and pushes "repos:changed" to all clients.
 */
export class GitWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly appState: AppState,
    private readonly pushPatch: PushPatchFn,
  ) {}

  /** Scan all projects and start watching their repos. */
  start(): void {
    const projects = this.appState.getState().projects;
    for (const project of projects) {
      this.watchProject(project.slug);
    }
  }

  /** Refresh watchers for a single project (call after repo add/remove). */
  watchProject(projectSlug: string): void {
    const projectDir = this.appState.getProjectDir(projectSlug);
    const repoNames = this.appState.discoverRepos(projectSlug);

    // Watch project-root repos
    for (const repoName of repoNames) {
      const repoDir = path.join(projectDir, repoName);
      this.watchRepo(repoDir, projectSlug, undefined);
    }

    // Watch workspace repos
    const project = this.appState.getProject(projectSlug);
    if (project) {
      for (const ws of project.workspaces) {
        const wsDir = path.join(projectDir, "workspaces", ws.slug);
        for (const repoName of repoNames) {
          const repoDir = path.join(wsDir, repoName);
          this.watchRepo(repoDir, projectSlug, ws.id);
        }
      }
    }
  }

  private watchRepo(repoDir: string, projectSlug: string, workspaceId: string | undefined): void {
    const gitDir = path.join(repoDir, ".git");

    // For worktrees, .git is a file pointing to the real git dir
    let resolvedGitDir: string;
    try {
      const stat = fs.statSync(gitDir);
      if (stat.isFile()) {
        // Worktree: .git file contains "gitdir: <path>"
        const content = fs.readFileSync(gitDir, "utf-8").trim();
        const match = content.match(/^gitdir:\s*(.+)$/);
        if (match?.[1]) {
          resolvedGitDir = path.resolve(repoDir, match[1]);
        } else {
          return;
        }
      } else {
        resolvedGitDir = gitDir;
      }
    } catch {
      return; // Repo dir doesn't exist
    }

    const filesToWatch = ["index", "HEAD"];
    for (const file of filesToWatch) {
      const filePath = path.join(resolvedGitDir, file);
      const watchKey = filePath;

      // Skip if already watching
      if (this.watchers.has(watchKey)) continue;

      try {
        const watcher = fs.watch(filePath, () => {
          this.scheduleRefresh(projectSlug, workspaceId);
        });
        watcher.on("error", () => {
          // File may have been deleted — clean up
          this.watchers.delete(watchKey);
        });
        this.watchers.set(watchKey, watcher);
      } catch {
        // File doesn't exist yet — skip
      }
    }
  }

  private scheduleRefresh(projectSlug: string, workspaceId: string | undefined): void {
    // Debounce per project+workspace — git operations often touch both index and HEAD
    const key = workspaceId ?? `project:${projectSlug}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        void this.refreshAndPush(projectSlug, workspaceId);
      }, 200),
    );
  }

  private async refreshAndPush(
    projectSlug: string,
    workspaceId: string | undefined,
  ): Promise<void> {
    try {
      const wsSlug = workspaceId?.split("/")[1];
      const repoInfo = await getRepoInfo(this.appState, projectSlug, wsSlug);
      const key = workspaceId ?? `project:${projectSlug}`;
      const update: Record<string, RepoInfo[]> = { [key]: repoInfo };
      this.pushPatch({ repoInfo: update });
    } catch {
      // Repo may have been deleted
    }
  }

  /** Close watchers for a specific project and its workspaces. */
  unwatchProject(projectSlug: string): void {
    const projectDir = this.appState.getProjectDir(projectSlug);

    for (const [key, watcher] of this.watchers) {
      if (key.startsWith(projectDir)) {
        watcher.close();
        this.watchers.delete(key);
      }
    }

    for (const [key, timer] of this.debounceTimers) {
      if (key === `project:${projectSlug}` || key.startsWith(`${projectSlug}/`)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }
  }

  stop(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
