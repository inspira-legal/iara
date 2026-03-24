import * as fs from "node:fs";
import * as path from "node:path";
import type { PushFn } from "../types.js";
import { computeProjectHash } from "./sessions.js";
import type { AppState } from "./state.js";

const DEBOUNCE_MS = 500;

/**
 * Watches Claude session JSONL directories for changes and pushes
 * `session:changed` events to connected clients.
 */
export class SessionWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private hashToWorkspaceIds = new Map<string, Set<string>>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pushAll: PushFn;
  private appState: AppState;

  constructor(pushAll: PushFn, appState: AppState) {
    this.pushAll = pushAll;
    this.appState = appState;
  }

  /**
   * Rebuild watches for all workspaces across all projects.
   * Call on startup and when workspaces/projects change.
   */
  refresh(): void {
    const { projects } = this.appState.getState();
    const newHashes = new Map<string, Set<string>>();

    for (const project of projects) {
      for (const workspace of project.workspaces) {
        const wsDir = this.appState.getWorkspaceDir(workspace.id);
        const hash = computeProjectHash(wsDir);

        if (!newHashes.has(hash)) {
          newHashes.set(hash, new Set());
        }
        newHashes.get(hash)!.add(workspace.id);
      }
    }

    // Remove watchers for hashes that no longer exist
    for (const [hash, watcher] of this.watchers) {
      if (!newHashes.has(hash)) {
        watcher.close();
        this.watchers.delete(hash);
      }
    }

    this.hashToWorkspaceIds = newHashes;

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
        const workspaceIds = this.hashToWorkspaceIds.get(hash);
        if (workspaceIds) {
          for (const workspaceId of workspaceIds) {
            this.pushAll("session:changed", { workspaceId });
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
