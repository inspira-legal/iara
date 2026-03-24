import { useEffect, useCallback, useRef } from "react";
import { useRegenerateStore } from "~/stores/regenerate";
import type { ClaudeProgress } from "@iara/contracts";

interface UseRegenerateOptions {
  entityId: string;
  filePath: string;
  regenerateFn: () => Promise<{ requestId: string }>;
}

interface UseRegenerateResult {
  isRegenerating: boolean;
  showEmptyBanner: boolean;
  messages: ClaudeProgress[];
  result: unknown | null;
  error: string | null;
  handleStartRegenerate: () => Promise<void>;
  cancel: () => void;
}

export function useRegenerate({
  entityId,
  filePath,
  regenerateFn,
}: UseRegenerateOptions): UseRegenerateResult {
  const startRegenerate = useRegenerateStore((s) => s.startRegenerate);
  const checkFile = useRegenerateStore((s) => s.checkFile);
  const cancelFn = useRegenerateStore((s) => s.cancel);

  // Subscribe to specific entity state — triggers re-render when this entity changes
  const entry = useRegenerateStore((s) => s.entries[entityId]);
  const fileStatus = useRegenerateStore((s) => s.fileStatus[entityId]);
  const fileStatusLoading = useRegenerateStore((s) => s.fileStatusLoading[entityId] ?? true);

  // Check file on mount and when entityId/filePath changes
  useEffect(() => {
    void checkFile(entityId, filePath);
  }, [entityId, filePath, checkFile]);

  const handleStartRegenerate = useCallback(
    () => startRegenerate(entityId, filePath, regenerateFn),
    [entityId, filePath, regenerateFn, startRegenerate],
  );

  const cancel = useCallback(() => cancelFn(entityId), [entityId, cancelFn]);

  const isRegenerating = entry?.isLoading ?? false;
  const hasError = entry?.error != null;
  const showEmptyBanner =
    !fileStatusLoading && fileStatus != null && (!fileStatus.exists || fileStatus.empty);

  // Auto-generate when file is empty — only once per entity
  const autoTriggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      showEmptyBanner &&
      !isRegenerating &&
      !hasError &&
      !autoTriggeredRef.current.has(entityId)
    ) {
      autoTriggeredRef.current.add(entityId);
      void startRegenerate(entityId, filePath, regenerateFn);
    }
  }, [
    showEmptyBanner,
    isRegenerating,
    hasError,
    entityId,
    filePath,
    regenerateFn,
    startRegenerate,
  ]);

  return {
    isRegenerating,
    showEmptyBanner,
    messages: entry?.messages ?? [],
    result: entry?.result ?? null,
    error: entry?.error ?? null,
    handleStartRegenerate,
    cancel,
  };
}
