import * as fs from "node:fs";
import * as path from "node:path";
import type { PushFn } from "../types.js";
import type { AppState } from "./state.js";

export class ProjectsWatcher {
  private watcher: fs.FSWatcher | null = null;
  private ownWrites = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges = new Map<string, "project" | "workspace">();

  constructor(
    private readonly projectsDir: string,
    private readonly appState: AppState,
    private readonly pushFn: PushFn,
  ) {}

  start(): void {
    try {
      this.watcher = fs.watch(this.projectsDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;

        const basename = path.basename(filename);
        if (basename !== "project.json" && basename !== "workspace.json") return;

        const fullPath = path.join(this.projectsDir, filename);
        if (this.ownWrites.has(fullPath)) {
          const timer = this.ownWrites.get(fullPath);
          if (timer) clearTimeout(timer);
          this.ownWrites.delete(fullPath);
          return;
        }

        const type = basename === "project.json" ? "project" : "workspace";
        this.pendingChanges.set(filename, type);
        this.scheduleFlush();
      });
    } catch {
      // Projects dir may not exist yet
    }
  }

  /** Mark a path as "we wrote this, don't trigger". */
  suppressNext(fullPath: string): void {
    const existing = this.ownWrites.get(fullPath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.ownWrites.delete(fullPath), 1000);
    this.ownWrites.set(fullPath, timer);
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), 100);
  }

  private flush(): void {
    let needsFullResync = false;
    const projectSlugs = new Set<string>();

    for (const [filename] of this.pendingChanges) {
      const parts = filename.split(path.sep);
      projectSlugs.add(parts[0] as string);
    }

    for (const projectSlug of projectSlugs) {
      const project = this.appState.rescanProject(projectSlug);
      if (!project) {
        needsFullResync = true;
      }
    }

    if (needsFullResync) {
      this.appState.scan();
      this.pushFn("state:resync", { state: this.appState.getState() });
    } else {
      // Push individual project changes
      for (const projectSlug of projectSlugs) {
        const project = this.appState.getProject(projectSlug);
        if (project) {
          this.pushFn("project:changed", { project });
        }
      }
    }

    this.pendingChanges.clear();
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.watcher?.close();
    this.watcher = null;
  }
}
