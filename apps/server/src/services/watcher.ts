import * as path from "node:path";
import type { AsyncSubscription } from "@parcel/watcher";
import type { PushFn } from "../types.js";
import type { AppState } from "./state.js";

export class ProjectsWatcher {
  private subscription: AsyncSubscription | null = null;
  private ownWrites = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingProjectSlugs = new Set<string>();

  constructor(
    private readonly projectsDir: string,
    private readonly appState: AppState,
    private readonly pushFn: PushFn,
  ) {}

  async start(): Promise<void> {
    try {
      const watcher = await import("@parcel/watcher");
      this.subscription = await watcher.subscribe(
        this.projectsDir,
        (_err, events) => {
          try {
            for (const event of events) {
              const fullPath = event.path;

              // Suppress own writes
              if (this.ownWrites.has(fullPath)) {
                const timer = this.ownWrites.get(fullPath);
                if (timer) clearTimeout(timer);
                this.ownWrites.delete(fullPath);
                continue;
              }

              const rel = path.relative(this.projectsDir, fullPath);
              const parts = rel.split(path.sep);

              // We care about:
              // 1. iara-scripts.yaml changes at project root
              // 2. workspaces/ subdirectory add/remove
              // 3. Repo add/remove at project root
              const projectSlug = parts[0];
              if (!projectSlug) continue;

              const basename = parts[parts.length - 1];

              // iara-scripts.yaml change
              if (basename === "iara-scripts.yaml" && parts.length === 2) {
                this.pendingProjectSlugs.add(projectSlug);
                this.scheduleFlush();
                continue;
              }

              // workspaces/ dir change (workspace added/removed)
              if (parts[1] === "workspaces") {
                this.pendingProjectSlugs.add(projectSlug);
                this.scheduleFlush();
                continue;
              }

              // Repo added/removed at project root (dir with .git/)
              if (parts.length <= 2 && basename === ".git") {
                this.pendingProjectSlugs.add(projectSlug);
                this.scheduleFlush();
                continue;
              }
            }
          } catch {
            // FS may be in inconsistent state during deletions — trigger full resync
            this.scheduleFlush();
          }
        },
        {
          ignore: ["**/.git/**", "**/node_modules/**"],
        },
      );
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
    try {
      const slugs = [...this.pendingProjectSlugs];
      this.pendingProjectSlugs.clear();

      let needsFullResync = false;
      const rescanned = new Map<
        string,
        NonNullable<ReturnType<typeof this.appState.rescanProject>>
      >();

      for (const projectSlug of slugs) {
        const wasPreviouslyKnown = !!this.appState.getProject(projectSlug);
        const project = this.appState.rescanProject(projectSlug);
        if (project) {
          rescanned.set(projectSlug, project);
        } else if (wasPreviouslyKnown) {
          needsFullResync = true;
        }
      }

      if (needsFullResync) {
        this.appState.scan();
        this.pushFn("state:resync", { state: this.appState.getState() });
      } else {
        for (const project of rescanned.values()) {
          this.pushFn("project:changed", { project });
        }
      }
    } catch {
      // FS may be in inconsistent state during deletions — full resync
      this.appState.scan();
      this.pushFn("state:resync", { state: this.appState.getState() });
    }
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    await this.subscription?.unsubscribe();
    this.subscription = null;
  }
}
