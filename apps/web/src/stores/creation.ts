import { create } from "zustand";
import type { CreationProgress, CreationStage } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";

interface CreationEntry {
  requestId: string;
  type: "project" | "workspace";
  stage: CreationStage;
  name?: string;
  entityId?: string;
  error?: string;
}

interface CreationStore {
  entries: Map<string, CreationEntry>;
  /** Called by the UI hook to register a toast listener */
  onProgressCallbacks: Set<(entry: CreationEntry) => void>;
  addListener: (cb: (entry: CreationEntry) => void) => () => void;
}

const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useCreationStore = create<CreationStore>((set, get) => ({
  entries: new Map(),
  onProgressCallbacks: new Set(),

  addListener: (cb) => {
    get().onProgressCallbacks.add(cb);
    return () => {
      get().onProgressCallbacks.delete(cb);
    };
  },
}));

// ---------------------------------------------------------------------------
// WS subscription — runs once at module load
// ---------------------------------------------------------------------------

transport.subscribe("creation:progress", (params: CreationProgress) => {
  const { requestId } = params;
  const store = useCreationStore.getState();

  const entry: CreationEntry = {
    requestId,
    type: params.type,
    stage: params.stage,
    ...(params.name != null ? { name: params.name } : {}),
    ...(params.entityId != null ? { entityId: params.entityId } : {}),
    ...(params.error != null ? { error: params.error } : {}),
  };

  const next = new Map(store.entries);
  next.set(requestId, entry);

  useCreationStore.setState({ entries: next });

  // Notify listeners (toast hook)
  for (const cb of store.onProgressCallbacks) {
    cb(entry);
  }

  // Clean up completed/errored entries after a delay
  if (params.stage === "done" || params.stage === "error") {
    const prev = cleanupTimers.get(requestId);
    if (prev) clearTimeout(prev);
    cleanupTimers.set(
      requestId,
      setTimeout(() => {
        cleanupTimers.delete(requestId);
        const current = useCreationStore.getState();
        const updated = new Map(current.entries);
        updated.delete(requestId);
        useCreationStore.setState({ entries: updated });
      }, 15_000),
    );
  }
});
