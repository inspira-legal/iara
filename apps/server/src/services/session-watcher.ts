import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as watcher from "@parcel/watcher";
import type { SessionInfo } from "@iara/contracts";
import type { PushPatchFn } from "../types.js";
import { computeProjectHash, listSessions } from "./sessions.js";
import type { AppState } from "./state.js";

const DEBOUNCE_MS = 500;

/**
 * Watches Claude session JSONL directories for changes and pushes
 * `session:changed` events to connected clients.
 *
 * Uses @parcel/watcher for reliable cross-platform file watching.
 */
export class SessionWatcher {
  private subscriptions = new Map<string, watcher.AsyncSubscription>();
  private hashToWorkspaceIds = new Map<string, Set<string>>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pushPatch: PushPatchFn;
  private appState: AppState;

  constructor(pushPatch: PushPatchFn, appState: AppState) {
    this.pushPatch = pushPatch;
    this.appState = appState;
  }

  /**
   * Rebuild watches for all workspaces across all projects.
   * Call on startup and when workspaces/projects change.
   */
  async refresh(): Promise<void> {
    const { projects } = this.appState.getState();
    const newHashes = new Map<string, Set<string>>();

    for (const project of projects) {
      for (const workspace of project.workspaces) {
        const wsDir = this.appState.getWorkspaceDir(workspace.id);

        // Watch the workspace dir itself
        const hash = computeProjectHash(wsDir);
        if (!newHashes.has(hash)) newHashes.set(hash, new Set());
        newHashes.get(hash)!.add(workspace.id);

        // Also watch the parent dir — Claude CLI may hash the parent as cwd
        const parentHash = computeProjectHash(path.dirname(wsDir));
        if (parentHash !== hash) {
          if (!newHashes.has(parentHash)) newHashes.set(parentHash, new Set());
          newHashes.get(parentHash)!.add(workspace.id);
        }

        // Also watch repo subdirs within the workspace
        const repoNames = this.appState.discoverRepos(project.id);
        for (const name of repoNames) {
          const repoDir = path.join(wsDir, name);
          const repoHash = computeProjectHash(repoDir);
          if (repoHash !== hash) {
            if (!newHashes.has(repoHash)) newHashes.set(repoHash, new Set());
            newHashes.get(repoHash)!.add(workspace.id);
          }
        }
      }
    }

    // Remove subscriptions for hashes that no longer exist
    for (const [hash, sub] of this.subscriptions) {
      if (!newHashes.has(hash)) {
        await sub.unsubscribe();
        this.subscriptions.delete(hash);
      }
    }

    this.hashToWorkspaceIds = newHashes;

    // Add subscriptions for new hashes
    for (const hash of newHashes.keys()) {
      if (!this.subscriptions.has(hash)) {
        await this.watchHash(hash);
      }
    }
  }

  private async watchHash(hash: string): Promise<void> {
    const dir = path.join(os.homedir(), ".claude", "projects", hash);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const sub = await watcher.subscribe(dir, (_err, events) => {
        const hasJsonl = events.some((e) => e.path.endsWith(".jsonl"));
        if (hasJsonl) {
          this.debouncedNotify(hash);
        }
      });
      this.subscriptions.set(hash, sub);
    } catch {
      // Directory not accessible
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
          const sessionsUpdate: Record<string, SessionInfo[]> = {};
          const dirs: string[] = [];
          const wsIds: string[] = [];
          for (const workspaceId of workspaceIds) {
            const wsDir = this.appState.getWorkspaceDir(workspaceId);
            dirs.push(wsDir);
            wsIds.push(workspaceId);
          }
          // Load sessions for all affected workspaces and push
          void Promise.allSettled(
            wsIds.map(async (wsId, i) => {
              try {
                sessionsUpdate[wsId] = await listSessions([dirs[i]!]);
              } catch {
                sessionsUpdate[wsId] = [];
              }
            }),
          ).then(() => {
            this.pushPatch({ sessions: sessionsUpdate });
          });
        }
      }, DEBOUNCE_MS),
    );
  }

  stop(): void {
    for (const sub of this.subscriptions.values()) {
      void sub.unsubscribe().catch(() => {});
    }
    this.subscriptions.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
