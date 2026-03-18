import { useState, useCallback, useEffect, useRef } from "react";
import { ensureNativeApi } from "~/nativeApi";

export type TerminalStatus = "idle" | "connecting" | "active" | "exited";

interface UseTerminalReturn {
  terminalId: string | null;
  sessionId: string | null;
  status: TerminalStatus;
  exitCode: number | null;
  create: (resumeSessionId?: string) => Promise<void>;
  restart: () => Promise<void>;
  destroy: () => Promise<void>;
}

export function useTerminal(taskId: string): UseTerminalReturn {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const create = useCallback(
    async (resumeSessionId?: string) => {
      try {
        const api = ensureNativeApi();
        setStatus("connecting");
        setExitCode(null);
        const result = await api.terminalCreate(taskId, resumeSessionId);
        terminalIdRef.current = result.terminalId;
        sessionIdRef.current = result.sessionId;
        setTerminalId(result.terminalId);
        setSessionId(result.sessionId);
        setStatus("active");
      } catch (err) {
        console.error("Failed to create terminal:", err);
        setStatus("exited");
        setExitCode(-1);
      }
    },
    [taskId],
  );

  const destroy = useCallback(async () => {
    if (!terminalIdRef.current) return;
    const api = ensureNativeApi();
    await api.terminalDestroy(terminalIdRef.current);
    terminalIdRef.current = null;
    sessionIdRef.current = null;
    setTerminalId(null);
    setSessionId(null);
    setStatus("idle");
  }, []);

  const restart = useCallback(async () => {
    const prevSessionId = sessionIdRef.current;
    await destroy();
    await create(prevSessionId ?? undefined);
  }, [destroy, create]);

  // Listen for terminal exit
  useEffect(() => {
    const api = ensureNativeApi();
    const handleExit = (tid: string, code: number) => {
      if (tid === terminalIdRef.current) {
        setStatus("exited");
        setExitCode(code);
        terminalIdRef.current = null;
        setTerminalId(null);
      }
    };
    api.onTerminalExit(handleExit);
    return () => {
      api.offTerminalExit();
    };
  }, []);

  return { terminalId, sessionId, status, exitCode, create, restart, destroy };
}
