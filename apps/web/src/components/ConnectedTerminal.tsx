import { useRef, useEffect, useCallback, type ReactNode } from "react";
import { transport } from "~/lib/ws-transport";
import { XTerm, getOrCreateXTermInstance, destroyXTermInstance } from "~/components/XTerm";
import { useToast } from "~/components/Toast";

interface ConnectedTerminalProps {
  /** Server-assigned terminal ID. When null/undefined, nothing renders. */
  terminalId: string | null | undefined;
  /** Prefix for the XTerm instance cache key (e.g. "claude", "shell"). */
  instancePrefix?: string | undefined;
  /** Called when the terminal process exits. */
  onExit?: ((exitCode: number) => void) | undefined;
  className?: string | undefined;
  children?: ReactNode | undefined;
}

/**
 * Wires a server-side terminal (PTY) to an XTerm instance:
 * - Subscribes to `terminal:data` and writes to xterm
 * - Subscribes to `terminal:exit` and calls `onExit`
 * - Sends `terminal.write` on user input
 * - Sends `terminal.resize` on dimension changes
 *
 * Consumers handle lifecycle (create/destroy) and overlays.
 */
export function ConnectedTerminal({
  terminalId,
  instancePrefix = "term",
  onExit,
  className,
  children,
}: ConnectedTerminalProps) {
  const { toast } = useToast();
  const terminalIdRef = useRef(terminalId);
  terminalIdRef.current = terminalId;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const instanceId = terminalId ? `${instancePrefix}:${terminalId}` : null;

  // Subscribe to terminal data → xterm
  useEffect(() => {
    if (!terminalId || !instanceId) return;
    const tid = terminalId;
    const iid = instanceId;

    const unsubData = transport.subscribe("terminal:data", ({ terminalId: evtTid, data }) => {
      if (evtTid === tid) {
        getOrCreateXTermInstance(iid, { terminalId: tid }).writeData(data);
      }
    });

    const unsubExit = transport.subscribe("terminal:exit", ({ terminalId: evtTid, exitCode }) => {
      if (evtTid === tid) {
        onExitRef.current?.(exitCode);
      }
    });

    return () => {
      unsubData();
      unsubExit();
    };
  }, [terminalId, instanceId]);

  const handleData = useCallback((data: string) => {
    const tid = terminalIdRef.current;
    if (tid) {
      transport.request("terminal.write", { terminalId: tid, data }).catch(() => {});
    }
  }, []);

  const handleResize = useCallback((cols: number, rows: number) => {
    const tid = terminalIdRef.current;
    if (tid) {
      transport.request("terminal.resize", { terminalId: tid, cols, rows }).catch(() => {});
    }
  }, []);

  if (!terminalId || !instanceId) return children ?? null;

  return (
    <XTerm
      instanceId={instanceId}
      terminalId={terminalId}
      onData={handleData}
      onResize={handleResize}
      onCopy={() => toast("Copied to clipboard", "success")}
      className={className}
    />
  );
}

export { destroyXTermInstance };
