import * as fs from "node:fs";
import * as path from "node:path";
import type { WsPushEvents } from "@iara/contracts";
import { computeProjectHash } from "./sessions.js";
import { getProjectDir } from "./projects.js";
import { listTasks } from "./tasks.js";
import { db, schema } from "../db.js";

type PushFn = <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

const DEBOUNCE_MS = 500;

/**
 * Watches Claude session JSONL directories for changes and pushes
 * `session:changed` events to connected clients.
 */
export class SessionWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private hashToTaskIds = new Map<string, Set<string>>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pushAll: PushFn;

  constructor(pushAll: PushFn) {
    this.pushAll = pushAll;
  }

  /**
   * Rebuild watches for all tasks and project roots across all projects.
   * Call on startup and when tasks/projects change.
   */
  refresh(): void {
    const allProjects = db.select().from(schema.projects).all();
    const newHashes = new Map<string, Set<string>>();

    for (const project of allProjects) {
      const projectDir = getProjectDir(project.slug);

      // Watch default workspace sessions (default:<projectId>)
      const rootHash = computeProjectHash(projectDir);
      if (!newHashes.has(rootHash)) {
        newHashes.set(rootHash, new Set());
      }
      newHashes.get(rootHash)!.add(`default:${project.id}`);

      const tasks = listTasks(project.id);

      for (const task of tasks) {
        const taskDir = path.join(projectDir, task.slug);
        const hash = computeProjectHash(taskDir);

        if (!newHashes.has(hash)) {
          newHashes.set(hash, new Set());
        }
        newHashes.get(hash)!.add(task.id);
      }
    }

    // Remove watchers for hashes that no longer exist
    for (const [hash, watcher] of this.watchers) {
      if (!newHashes.has(hash)) {
        watcher.close();
        this.watchers.delete(hash);
      }
    }

    this.hashToTaskIds = newHashes;

    // Add watchers for new hashes
    for (const hash of newHashes.keys()) {
      if (!this.watchers.has(hash)) {
        this.watchHash(hash);
      }
    }
  }

  private watchHash(hash: string): void {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const dir = path.join(home, ".claude", "projects", hash);

    // Create dir if it doesn't exist so we can watch it
    fs.mkdirSync(dir, { recursive: true });

    try {
      const watcher = fs.watch(dir, (_event, filename) => {
        if (!filename?.endsWith(".jsonl")) return;
        this.debouncedNotify(hash);
      });

      watcher.on("error", () => {
        // Directory may have been removed
        this.watchers.delete(hash);
      });

      this.watchers.set(hash, watcher);
    } catch {
      // Directory doesn't exist yet — will be created when Claude launches
    }
  }

  private debouncedNotify(hash: string): void {
    const existing = this.debounceTimers.get(hash);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      hash,
      setTimeout(() => {
        this.debounceTimers.delete(hash);
        const taskIds = this.hashToTaskIds.get(hash);
        if (taskIds) {
          for (const taskId of taskIds) {
            this.pushAll("session:changed", { taskId });
          }
        }
      }, DEBOUNCE_MS),
    );
  }

  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
