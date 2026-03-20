import { create } from "zustand";
import type { ClaudeProgress } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";

interface RegenerateEntry {
  requestId: string;
  messages: ClaudeProgress[];
  result: unknown | null;
  error: string | null;
  isLoading: boolean;
}

interface FileStatus {
  exists: boolean;
  empty: boolean;
}

interface RegenerateState {
  entries: Record<string, RegenerateEntry>;
  fileStatus: Record<string, FileStatus | null>;
  fileStatusLoading: Record<string, boolean>;

  startRegenerate: (
    entityId: string,
    filePath: string,
    regenerateFn: () => Promise<{ requestId: string }>,
  ) => Promise<void>;
  checkFile: (entityId: string, filePath: string) => Promise<void>;
  cancel: (entityId: string) => void;

  getEntry: (entityId: string) => RegenerateEntry | undefined;
  isRegenerating: (entityId: string) => boolean;
  showEmptyBanner: (entityId: string) => boolean;
}

// Track requestId → entityId so push events can be routed
const requestToEntity = new Map<string, string>();

let pushSubsInitialized = false;

function ensurePushSubs() {
  if (pushSubsInitialized) return;
  pushSubsInitialized = true;

  transport.subscribe("claude:progress", (params) => {
    const entityId = requestToEntity.get(params.requestId);
    if (!entityId) return;

    useRegenerateStore.setState((state) => {
      const entry = state.entries[entityId];
      if (!entry || !entry.isLoading) return state;

      return {
        entries: {
          ...state.entries,
          [entityId]: {
            ...entry,
            messages: [...entry.messages, params.progress],
          },
        },
      };
    });
  });

  transport.subscribe("claude:result", (params) => {
    const entityId = requestToEntity.get(params.requestId);
    if (!entityId) return;

    useRegenerateStore.setState((state) => {
      const entry = state.entries[entityId];
      if (!entry) return state;

      return {
        entries: {
          ...state.entries,
          [entityId]: {
            ...entry,
            result: params.result,
            isLoading: false,
          },
        },
      };
    });

    // Auto re-check file status — look up filePath from the entry's associated context
    // We need the filePath, so we store it in the requestToEntity mapping won't work.
    // Instead, schedule the check from the store's perspective.
    requestToEntity.delete(params.requestId);
  });

  transport.subscribe("claude:error", (params) => {
    const entityId = requestToEntity.get(params.requestId);
    if (!entityId) return;

    useRegenerateStore.setState((state) => {
      const entry = state.entries[entityId];
      if (!entry) return state;

      return {
        entries: {
          ...state.entries,
          [entityId]: {
            ...entry,
            error: params.error,
            isLoading: false,
          },
        },
      };
    });

    requestToEntity.delete(params.requestId);
  });
}

// Track entityId → filePath for auto re-check on result
const entityFilePaths = new Map<string, string>();

export const useRegenerateStore = create<RegenerateState>((set, get) => {
  // Initialize push subscriptions once
  ensurePushSubs();

  return {
    entries: {},
    fileStatus: {},
    fileStatusLoading: {},

    startRegenerate: async (entityId, filePath, regenerateFn) => {
      entityFilePaths.set(entityId, filePath);

      // Mark loading immediately for instant feedback
      set((state) => ({
        entries: {
          ...state.entries,
          [entityId]: {
            requestId: "",
            messages: [],
            result: null,
            error: null,
            isLoading: true,
          },
        },
      }));

      try {
        const { requestId } = await regenerateFn();
        requestToEntity.set(requestId, entityId);

        set((state) => ({
          entries: {
            ...state.entries,
            [entityId]: {
              ...state.entries[entityId]!,
              requestId,
            },
          },
        }));
      } catch (err) {
        set((state) => ({
          entries: {
            ...state.entries,
            [entityId]: {
              requestId: "",
              messages: [],
              result: null,
              error: err instanceof Error ? err.message : String(err),
              isLoading: false,
            },
          },
        }));
      }
    },

    checkFile: async (entityId, filePath) => {
      entityFilePaths.set(entityId, filePath);

      set((state) => ({
        fileStatusLoading: { ...state.fileStatusLoading, [entityId]: true },
      }));

      try {
        const result = await transport.request("prompts.check", { filePath });
        set((state) => ({
          fileStatus: { ...state.fileStatus, [entityId]: result },
          fileStatusLoading: { ...state.fileStatusLoading, [entityId]: false },
        }));
      } catch {
        set((state) => ({
          fileStatus: { ...state.fileStatus, [entityId]: null },
          fileStatusLoading: { ...state.fileStatusLoading, [entityId]: false },
        }));
      }
    },

    cancel: (entityId) => {
      const entry = get().entries[entityId];
      if (!entry) return;

      void transport.request("claude.cancel", { requestId: entry.requestId });

      set((state) => ({
        entries: {
          ...state.entries,
          [entityId]: {
            ...entry,
            error: "Cancelled",
            isLoading: false,
          },
        },
      }));

      requestToEntity.delete(entry.requestId);
    },

    getEntry: (entityId) => get().entries[entityId],

    isRegenerating: (entityId) => {
      const entry = get().entries[entityId];
      return entry?.isLoading ?? false;
    },

    showEmptyBanner: (entityId) => {
      const loading = get().fileStatusLoading[entityId] ?? true;
      if (loading) return false;
      const status = get().fileStatus[entityId];
      if (!status) return false;
      return !status.exists || status.empty;
    },
  };
});

// Subscribe to state changes to auto re-check file when generation completes.
// Registered immediately after store creation — no setTimeout race.
let prevLoadingState: Record<string, boolean> = {};

useRegenerateStore.subscribe((state) => {
  for (const [entityId, entry] of Object.entries(state.entries)) {
    const wasLoading = prevLoadingState[entityId] ?? false;
    if (wasLoading && !entry.isLoading && !entry.error) {
      // Generation completed successfully — re-check file
      const filePath = entityFilePaths.get(entityId);
      if (filePath) {
        void useRegenerateStore.getState().checkFile(entityId, filePath);
      }
    }
    prevLoadingState[entityId] = entry.isLoading;
  }
});
