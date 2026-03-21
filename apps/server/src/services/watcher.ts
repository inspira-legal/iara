import * as fs from "node:fs";
import * as path from "node:path";
import type { WsPushEvents } from "@iara/contracts";
import type { AppState } from "./state.js";

type PushFn = <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

export class ProjectsWatcher {
  private watcher: fs.FSWatcher | null = null;
  private ownWrites = new Set<string>();
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
        if (this.ownWrites.delete(fullPath)) return;

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
    this.ownWrites.add(fullPath);
    setTimeout(() => this.ownWrites.delete(fullPath), 1000);
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), 100);
  }

  private flush(): void {
    let needsFullResync = false;

    for (const [filename, type] of this.pendingChanges) {
      const parts = filename.split(path.sep);
      const projectSlug = parts[0] as string;

      if (type === "project") {
        const project = this.appState.rescanProject(projectSlug);
        if (project) {
          this.pushFn("project:changed", { project });
        } else {
          needsFullResync = true;
        }
      } else {
        const project = this.appState.rescanProject(projectSlug);
        if (project) {
          const wsSlug = parts[1] as string;
          const workspace = project.workspaces.find((w) => w.slug === wsSlug);
          if (workspace) {
            this.pushFn("workspace:changed", { workspace });
          } else {
            needsFullResync = true;
          }
        } else {
          needsFullResync = true;
        }
      }
    }

    if (needsFullResync) {
      this.appState.scan();
      this.pushFn("state:resync", { state: this.appState.getState() });
    }

    this.pendingChanges.clear();
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.watcher?.close();
    this.watcher = null;
  }
}
