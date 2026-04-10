import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoInfo } from "@iara/contracts";
import { ShallowWatcher } from "@iara/shared/shallow-watcher";
import { createKeyedDebounce } from "@iara/shared/timing";
import type { PushPatchFn } from "../types.js";
import type { AppState } from "./state.js";
import { getRepoInfo } from "./repos.js";

/**
 * Watches .git/index and .git/HEAD to detect branch switches, commits, etc.
 *
 * Lazy strategy: watches project-root repos for all projects, plus repos for
 * the single active non-main workspace. Call switchWorkspace() to change which
 * workspace is actively watched.
 */
export class GitWatcher {
  private watcher: ShallowWatcher;
  private debounce: ReturnType<typeof createKeyedDebounce<string>>;
  private fileToKey = new Map<string, string>();
  private keyToSlug = new Map<string, { projectSlug: string; workspaceId: string }>();
  private activeWorkspaceId: string | null = null;

  constructor(
    private readonly appState: AppState,
    private readonly pushPatch: PushPatchFn,
  ) {
    this.watcher = new ShallowWatcher({
      onChange: (watchedPath, _eventType, filename) => {
        // Only react to changes in index or HEAD files within .git dirs
        if (filename && filename !== "index" && filename !== "HEAD") return;
        const key = this.fileToKey.get(watchedPath);
        if (key) this.debounce.schedule(key);
      },
    });

    this.debounce = createKeyedDebounce<string>(300, (keys) => {
      for (const key of keys) {
        const info = this.keyToSlug.get(key);
        if (info) {
          void this.refreshAndPush(info.projectSlug, info.workspaceId);
        }
      }
    });
  }

  start(): void {
    const projects = this.appState.getState().projects;
    for (const project of projects) {
      this.watchProjectRoot(project.slug);
    }
  }

  watchProject(projectSlug: string): void {
    this.watchProjectRoot(projectSlug);
  }

  /** Watch only project-root repos (main workspace). */
  private watchProjectRoot(projectSlug: string): void {
    const projectDir = this.appState.getProjectDir(projectSlug);
    const repoNames = this.appState.discoverRepos(projectSlug);
    const project = this.appState.getProject(projectSlug);
    const mainWs = project?.workspaces.find((w) => w.slug === "main");
    const wsId = mainWs?.id ?? `${projectSlug}/main`;

    for (const repoName of repoNames) {
      const repoDir = path.join(projectDir, repoName);
      this.watchGitFiles(repoDir, wsId, projectSlug, wsId);
    }
  }

  /** Switch to watching a non-main workspace. Tears down previous workspace watches. */
  switchWorkspace(wsId: string | null): void {
    // Remove old workspace watches
    if (this.activeWorkspaceId) {
      this.removeWatchesForKey(this.activeWorkspaceId);
    }
    this.activeWorkspaceId = wsId;

    if (!wsId) return;

    const [projectSlug, wsSlug] = wsId.split("/") as [string, string];
    if (!wsSlug || wsSlug === "main") return;

    const projectDir = this.appState.getProjectDir(projectSlug);
    const repoNames = this.appState.discoverRepos(projectSlug);
    const wsDir = path.join(projectDir, "workspaces", wsSlug);

    for (const repoName of repoNames) {
      const repoDir = path.join(wsDir, repoName);
      this.watchGitFiles(repoDir, wsId, projectSlug, wsId);
    }
  }

  private watchGitFiles(
    repoDir: string,
    key: string,
    projectSlug: string,
    workspaceId: string,
  ): void {
    const gitDir = this.resolveGitDir(repoDir);
    if (!gitDir) return;

    this.keyToSlug.set(key, { projectSlug, workspaceId });

    // Watch the .git directory (not individual files) to survive atomic
    // renames that git uses when updating index/HEAD on Linux.
    if (!this.watcher.has(gitDir)) {
      try {
        fs.statSync(gitDir);
        this.watcher.add(gitDir);
        this.fileToKey.set(gitDir, key);
      } catch {
        // .git dir doesn't exist yet
      }
    }
  }

  private resolveGitDir(repoDir: string): string | null {
    const gitDir = path.join(repoDir, ".git");
    try {
      const stat = fs.statSync(gitDir);
      if (stat.isFile()) {
        const content = fs.readFileSync(gitDir, "utf-8").trim();
        const match = content.match(/^gitdir:\s*(.+)$/);
        return match?.[1] ? path.resolve(repoDir, match[1]) : null;
      }
      return gitDir;
    } catch {
      return null;
    }
  }

  private removeWatchesForKey(key: string): void {
    for (const [filePath, k] of this.fileToKey) {
      if (k === key) {
        this.watcher.remove(filePath);
        this.fileToKey.delete(filePath);
      }
    }
    this.keyToSlug.delete(key);
    this.debounce.cancel(key);
  }

  private async refreshAndPush(projectSlug: string, workspaceId: string): Promise<void> {
    try {
      const wsSlug = workspaceId.split("/")[1];
      const repoInfo = await getRepoInfo(this.appState, projectSlug, wsSlug);
      const update: Record<string, RepoInfo[]> = { [workspaceId]: repoInfo };
      this.pushPatch({ repoInfo: update });
    } catch {
      // Repo may have been deleted
    }
  }

  unwatchProject(projectSlug: string): void {
    const project = this.appState.getProject(projectSlug);
    const mainWs = project?.workspaces.find((w) => w.slug === "main");
    const mainKey = mainWs?.id ?? `${projectSlug}/main`;
    this.removeWatchesForKey(mainKey);

    // Also remove any active workspace watches for this project
    if (this.activeWorkspaceId?.startsWith(`${projectSlug}/`)) {
      this.removeWatchesForKey(this.activeWorkspaceId);
      this.activeWorkspaceId = null;
    }
  }

  stop(): void {
    this.watcher.stop();
    this.debounce.cancelAll();
    this.fileToKey.clear();
    this.keyToSlug.clear();
    this.activeWorkspaceId = null;
  }
}
