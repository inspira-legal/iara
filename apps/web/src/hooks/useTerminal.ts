import { useState, useCallback, useEffect, useRef } from "react";
import { transport } from "../lib/ws-transport.js";

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
        setStatus("connecting");
        setExitCode(null);
        const params: { taskId: string; resumeSessionId?: string } = { taskId };
        if (resumeSessionId !== undefined) {
          params.resumeSessionId = resumeSessionId;
        }
        const result = await transport.request("terminal.create", params);
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
    await transport.request("terminal.destroy", { terminalId: terminalIdRef.current });
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
    const unsub = transport.subscribe("terminal:exit", ({ terminalId: tid, exitCode: code }) => {
      if (tid === terminalIdRef.current) {
        setStatus("exited");
        setExitCode(code);
        terminalIdRef.current = null;
        setTerminalId(null);
      }
    });
    return unsub;
  }, []);

  return { terminalId, sessionId, status, exitCode, create, restart, destroy };
}
