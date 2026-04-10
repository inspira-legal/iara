import type { WsPushEvents } from "@iara/contracts";
import type { pushAll as pushAllFn } from "../ws.js";

export type StatePatch = WsPushEvents["state:patch"];
export type PushPatchFn = (patch: StatePatch) => void;

/**
 * Create a coalescing push function that batches state:patch within the same
 * microtask into a single WebSocket message per client.
 */
export function createPushPatch(pushAll: typeof pushAllFn): PushPatchFn {
  let pending: StatePatch | null = null;

  return (patch: StatePatch) => {
    if (!pending) {
      pending = { ...patch };
      queueMicrotask(() => {
        const merged = pending!;
        pending = null;
        pushAll("state:patch", merged);
      });
    } else {
      mergePatch(pending, patch);
    }
  };
}

function mergePatch(target: StatePatch, source: StatePatch): void {
  if (source.projects) target.projects = source.projects;
  if (source.settings) target.settings = source.settings;
  for (const field of ["repoInfo", "sessions", "env", "scripts", "scriptStatuses"] as const) {
    if (source[field]) {
      (target as any)[field] = { ...(target[field] as any), ...source[field] };
    }
  }
}
