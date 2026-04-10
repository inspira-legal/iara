import * as fs from "node:fs";
import * as path from "node:path";
import { ShallowWatcher } from "@iara/shared/shallow-watcher";
import { createKeyedDebounce } from "@iara/shared/timing";
import { generateDotEnvFiles, readEnvToml } from "./env.js";
import type { PushPatchFn } from "../types.js";
import type { AppState } from "./state.js";

export class ProjectsDirWatcher {
  private watcher: ShallowWatcher | null = null;
  private suppressedPaths = new Map<string, ReturnType<typeof setTimeout>>();

  private projectDebounce = createKeyedDebounce<string>(100, (slugs) => this.flushProjects(slugs));
  private envDebounce = createKeyedDebounce<string>(150, (slugs) => this.flushEnv(slugs));

  constructor(
    private readonly projectsDir: string,
    private readonly appState: AppState,
    private readonly pushPatch: PushPatchFn,
  ) {}

  async start(): Promise<void> {
    this.refreshAll();

    this.watcher = new ShallowWatcher({
      onChange: (_watchedPath, _eventType, filename) => {
        this.handleChange(_watchedPath, filename);
      },
      onError: (watchedPath) => {
        // Directory was deleted — schedule rescan for parent project
        const slug = this.slugFromWatchedPath(watchedPath);
        if (slug) this.projectDebounce.schedule(slug);
      },
    });

    this.addWatchPaths();
  }

  stop(): void {
    this.projectDebounce.cancelAll();
    this.envDebounce.cancelAll();
    this.watcher?.stop();
    this.watcher = null;
  }

  suppressWrite(workspaceDir: string): void {
    const tomlPath = path.join(workspaceDir, "env.toml");
    const existing = this.suppressedPaths.get(tomlPath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.suppressedPaths.delete(tomlPath), 1000);
    this.suppressedPaths.set(tomlPath, timer);
  }

  refresh(): void {
    if (!this.watcher) return;
    this.addWatchPaths();
  }

  private addWatchPaths(): void {
    if (!this.watcher) return;

    try {
      this.watcher.add(this.projectsDir);
    } catch {
      // projectsDir may not exist yet
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slugDir = path.join(this.projectsDir, entry.name);
      this.watcher.add(slugDir);

      const wsDir = path.join(slugDir, "workspaces");
      try {
        if (fs.statSync(wsDir).isDirectory()) {
          this.watcher.add(wsDir);
          // Watch individual workspace dirs for env.toml changes
          for (const wsEntry of fs.readdirSync(wsDir, { withFileTypes: true })) {
            if (wsEntry.isDirectory()) {
              this.watcher.add(path.join(wsDir, wsEntry.name));
            }
          }
        }
      } catch {
        // no workspaces dir
      }
    }
  }

  private handleChange(watchedPath: string, filename: string | null): void {
    if (!filename) return;

    // Determine which level this watch is at
    if (watchedPath === this.projectsDir) {
      // A new or removed project directory — add watch and schedule rescan
      const slugDir = path.join(this.projectsDir, filename);
      try {
        if (fs.statSync(slugDir).isDirectory()) {
          this.watcher?.add(slugDir);
          const wsDir = path.join(slugDir, "workspaces");
          try {
            if (fs.statSync(wsDir).isDirectory()) {
              this.watcher?.add(wsDir);
            }
          } catch {}
        }
      } catch {}
      this.projectDebounce.schedule(filename);
      return;
    }

    const rel = path.relative(this.projectsDir, watchedPath);
    const parts = rel.split(path.sep);
    const slug = parts[0];
    if (!slug) return;

    if (parts.length === 1) {
      // Watching <projectsDir>/<slug>/ — events for files/dirs directly inside project root
      if (filename === "iara-scripts.yaml") {
        this.projectDebounce.schedule(slug);
      } else if (filename === ".git" || filename === "workspaces") {
        if (filename === "workspaces") {
          const wsDir = path.join(watchedPath, "workspaces");
          try {
            if (fs.statSync(wsDir).isDirectory()) {
              this.watcher?.add(wsDir);
            }
          } catch {}
        }
        this.projectDebounce.schedule(slug);
      } else if (filename === "env.toml") {
        const fullPath = path.join(watchedPath, filename);
        if (this.consumeSuppression(fullPath)) return;
        this.envDebounce.schedule(slug);
      } else {
        // Could be a new repo directory (has .git inside)
        const candidateDir = path.join(watchedPath, filename);
        try {
          if (fs.statSync(candidateDir).isDirectory()) {
            this.projectDebounce.schedule(slug);
          }
        } catch {}
      }
      return;
    }

    if (parts.length === 2 && parts[1] === "workspaces") {
      // Watching <projectsDir>/<slug>/workspaces/ — workspace added/removed
      this.projectDebounce.schedule(slug);

      // Watch new workspace dirs for env.toml changes
      const newWsDir = path.join(watchedPath, filename);
      try {
        if (fs.statSync(newWsDir).isDirectory()) {
          this.watcher?.add(newWsDir);
        }
      } catch {}
      return;
    }

    if (parts.length === 3 && parts[1] === "workspaces") {
      // Watching <projectsDir>/<slug>/workspaces/<ws>/ — env.toml in workspace
      if (filename === "env.toml") {
        const fullPath = path.join(watchedPath, filename);
        if (this.consumeSuppression(fullPath)) return;
        this.envDebounce.schedule(slug);
      }
      return;
    }
  }

  private consumeSuppression(fullPath: string): boolean {
    const timer = this.suppressedPaths.get(fullPath);
    if (timer) {
      clearTimeout(timer);
      this.suppressedPaths.delete(fullPath);
      return true;
    }
    return false;
  }

  private slugFromWatchedPath(watchedPath: string): string | null {
    if (watchedPath === this.projectsDir) return null;
    const rel = path.relative(this.projectsDir, watchedPath);
    return rel.split(path.sep)[0] ?? null;
  }

  private flushProjects(slugs: Set<string>): void {
    try {
      let needsFullResync = false;
      for (const slug of slugs) {
        const wasPreviouslyKnown = !!this.appState.getProject(slug);
        const project = this.appState.rescanProject(slug);
        if (!project && wasPreviouslyKnown) {
          needsFullResync = true;
        }
      }
      if (needsFullResync) {
        this.appState.scan();
      }
      this.pushPatch({ projects: this.appState.getState().projects });
    } catch {
      this.appState.scan();
      this.pushPatch({ projects: this.appState.getState().projects });
    }
  }

  private flushEnv(slugs: Set<string>): void {
    const envPatch: Record<string, import("@iara/contracts").EnvData> = {};
    for (const slug of slugs) {
      const project = this.appState.getProject(slug);
      if (!project) continue;
      const repoNames = this.appState.discoverRepos(slug);
      if (repoNames.length === 0) continue;
      for (const ws of project.workspaces) {
        const wsDir = this.appState.getWorkspaceDir(ws.id);
        generateDotEnvFiles(wsDir, repoNames);
        envPatch[ws.id] = readEnvToml(wsDir);
      }
    }
    if (Object.keys(envPatch).length > 0) {
      this.pushPatch({ env: envPatch });
    }
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
}
