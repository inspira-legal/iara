import { useState, useRef, useEffect, useCallback } from "react";
import type { ClaudeProgress } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";

interface UseClaudeSuggestionOptions {
  requestFn: (userGoal: string) => Promise<{ requestId: string }>;
  onResult: (result: { content: string }) => void;
  onError?: (error: string) => void;
}

interface UseClaudeSuggestionReturn {
  ask: (userGoal: string) => Promise<void>;
  messages: ClaudeProgress[];
  error: string | null;
  isAnalyzing: boolean;
  reset: () => void;
}

export function useClaudeSuggestion({
  requestFn,
  onResult,
  onError,
}: UseClaudeSuggestionOptions): UseClaudeSuggestionReturn {
  const [messages, setMessages] = useState<ClaudeProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const unsubscribesRef = useRef<(() => void)[]>([]);

  const cleanupSubs = useCallback(() => {
    for (const unsub of unsubscribesRef.current) unsub();
    unsubscribesRef.current = [];
  }, []);

  useEffect(() => cleanupSubs, [cleanupSubs]);

  const reset = useCallback(() => {
    cleanupSubs();
    setMessages([]);
    setError(null);
    setIsAnalyzing(false);
  }, [cleanupSubs]);

  const ask = useCallback(
    async (userGoal: string) => {
      if (!userGoal.trim()) return;
      cleanupSubs();
      setMessages([]);
      setError(null);
      setIsAnalyzing(true);

      try {
        const { requestId } = await requestFn(userGoal.trim());

        const unsub1 = transport.subscribe("claude:progress", (params) => {
          if (params.requestId !== requestId) return;
          setMessages((prev) => [...prev.slice(-4), params.progress]);
        });
        const unsub2 = transport.subscribe("claude:result", (params) => {
          if (params.requestId !== requestId) return;
          cleanupSubs();
          setIsAnalyzing(false);
          onResult(params.result as { content: string });
        });
        const unsub3 = transport.subscribe("claude:error", (params) => {
          if (params.requestId !== requestId) return;
          cleanupSubs();
          setIsAnalyzing(false);
          const msg = params.error;
          setError(msg);
          onError?.(msg);
        });
        unsubscribesRef.current = [unsub1, unsub2, unsub3];
      } catch (err) {
        setIsAnalyzing(false);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        onError?.(msg);
      }
    },
    [requestFn, onResult, onError, cleanupSubs],
  );

  return { ask, messages, error, isAnalyzing, reset };
}
