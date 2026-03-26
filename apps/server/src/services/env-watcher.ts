import * as path from "node:path";
import type { AsyncSubscription } from "@parcel/watcher";
import { generateDotEnvFiles } from "./env.js";
import type { AppState } from "./state.js";

/**
 * Watches for `env.toml` file changes across the projects directory
 * and regenerates `.env` files into affected repo worktrees (R6).
 */
export class EnvWatcher {
  private subscription: AsyncSubscription | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWorkspaces = new Map<string, { projectSlug: string; wsId: string }>();
  private suppressedPaths = new Set<string>();

  constructor(
    private readonly projectsDir: string,
    private readonly appState: AppState,
  ) {}

  async start(): Promise<void> {
    // Write all .env files on startup (R6.4)
    this.refreshAll();

    try {
      const watcher = await import("@parcel/watcher");
      this.subscription = await watcher.subscribe(
        this.projectsDir,
        (_err, events) => {
          for (const event of events) {
            const basename = path.basename(event.path);
            if (basename !== "env.toml") continue;

            // Suppress own writes (R6.5)
            if (this.suppressedPaths.has(event.path)) {
              this.suppressedPaths.delete(event.path);
              continue;
            }

            const rel = path.relative(this.projectsDir, event.path);
            const parts = rel.split(path.sep);

            // env.toml at project root → main workspace
            // env.toml at workspaces/<slug>/env.toml → that workspace
            const projectSlug = parts[0];
            if (!projectSlug) continue;

            const project = this.appState.getProject(projectSlug);
            if (!project) continue;

            for (const ws of project.workspaces) {
              const wsDir = this.appState.getWorkspaceDir(ws.id);
              const expectedToml = path.join(wsDir, "env.toml");
              if (event.path === expectedToml) {
                this.pendingWorkspaces.set(ws.id, { projectSlug, wsId: ws.id });
              }
            }

            this.scheduleFlush();
          }
        },
        { ignore: ["**/.git/**", "**/node_modules/**"] },
      );
    } catch {
      // Projects dir may not exist yet
    }
  }

  /** Suppress the next watcher event for a given env.toml path (R6.5). */
  suppressWrite(workspaceDir: string): void {
    this.suppressedPaths.add(path.join(workspaceDir, "env.toml"));
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), 150);
  }

  private flush(): void {
    const entries = [...this.pendingWorkspaces.values()];
    this.pendingWorkspaces.clear();

    for (const { projectSlug, wsId } of entries) {
      this.refreshWorkspace(projectSlug, wsId);
    }
  }

  private refreshWorkspace(projectSlug: string, wsId: string): void {
    const repoNames = this.appState.discoverRepos(projectSlug);
    if (repoNames.length === 0) return;
    const wsDir = this.appState.getWorkspaceDir(wsId);
    generateDotEnvFiles(wsDir, repoNames);
  }

  private refreshAll(): void {
    for (const project of this.appState.getState().projects) {
      const repoNames = this.appState.discoverRepos(project.slug);
      if (repoNames.length === 0) continue;
      for (const ws of project.workspaces) {
        const wsDir = this.appState.getWorkspaceDir(ws.id);
        generateDotEnvFiles(wsDir, repoNames);
      }
    }
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    void this.subscription?.unsubscribe();
    this.subscription = null;
  }
}
