import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ShallowWatcher } from "@iara/shared/shallow-watcher";
import { createKeyedDebounce } from "@iara/shared/timing";
import type { SessionInfo } from "@iara/contracts";
import type { PushPatchFn } from "../types.js";
import { computeProjectHash, listSessions } from "./sessions.js";
import type { AppState } from "./state.js";

const DEBOUNCE_MS = 1000;

export class SessionWatcher {
  private watcher: ShallowWatcher;
  private hashToWorkspaceIds = new Map<string, Set<string>>();
  private debounce: ReturnType<typeof createKeyedDebounce<string>>;
  private pushPatch: PushPatchFn;
  private appState: AppState;

  constructor(pushPatch: PushPatchFn, appState: AppState) {
    this.pushPatch = pushPatch;
    this.appState = appState;

    this.watcher = new ShallowWatcher({
      onChange: (_watchedPath, _eventType, filename) => {
        if (!filename || !filename.endsWith(".jsonl")) return;
        const hash = path.basename(_watchedPath);
        if (this.hashToWorkspaceIds.has(hash)) {
          this.debounce.schedule(hash);
        }
      },
    });

    this.debounce = createKeyedDebounce<string>(DEBOUNCE_MS, (hashes) => {
      this.flushHashes(hashes);
    });
  }

  async refresh(): Promise<void> {
    const { projects } = this.appState.getState();
    const newHashes = new Map<string, Set<string>>();

    for (const project of projects) {
      for (const workspace of project.workspaces) {
        const wsDir = this.appState.getWorkspaceDir(workspace.id);
        const hash = computeProjectHash(wsDir);
        if (!newHashes.has(hash)) newHashes.set(hash, new Set());
        newHashes.get(hash)!.add(workspace.id);
      }
    }

    // Remove watches for hashes that no longer exist
    for (const hash of this.hashToWorkspaceIds.keys()) {
      if (!newHashes.has(hash)) {
        const dir = path.join(os.homedir(), ".claude", "projects", hash);
        this.watcher.remove(dir);
        this.debounce.cancel(hash);
      }
    }

    this.hashToWorkspaceIds = newHashes;

    // Add watches for new hashes
    for (const hash of newHashes.keys()) {
      const dir = path.join(os.homedir(), ".claude", "projects", hash);
      if (!this.watcher.has(dir)) {
        try {
          await fs.mkdir(dir, { recursive: true });
          this.watcher.add(dir);
        } catch {
          // Directory not accessible
        }
      }
    }
  }

  private flushHashes(hashes: Set<string>): void {
    const sessionsUpdate: Record<string, SessionInfo[]> = {};
    const pending: Array<{ wsId: string; dir: string }> = [];

    for (const hash of hashes) {
      const workspaceIds = this.hashToWorkspaceIds.get(hash);
      if (!workspaceIds) continue;
      for (const wsId of workspaceIds) {
        const wsDir = this.appState.getWorkspaceDir(wsId);
        pending.push({ wsId, dir: wsDir });
      }
    }

    if (pending.length === 0) return;

    void Promise.allSettled(
      pending.map(async ({ wsId, dir }) => {
        try {
          sessionsUpdate[wsId] = await listSessions([dir]);
        } catch {
          sessionsUpdate[wsId] = [];
        }
      }),
    ).then(() => {
      this.pushPatch({ sessions: sessionsUpdate });
    });
  }

  stop(): void {
    this.watcher.stop();
    this.debounce.cancelAll();
  }
}
