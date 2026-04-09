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
  /** Called when the terminal title changes (OSC 0/2). */
  onTitleChange?: ((title: string) => void) | undefined;
  /** Block Ctrl+Z (SIGTSTP) from reaching the terminal. */
  blockSuspend?: boolean | undefined;
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
  onTitleChange,
  blockSuspend,
  className,
  children,
}: ConnectedTerminalProps) {
  const { toast } = useToast();
  const terminalIdRef = useRef(terminalId);
  terminalIdRef.current = terminalId;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;

  const instanceId = terminalId ? `${instancePrefix}:${terminalId}` : null;

  // Subscribe to exit events and title changes (OSC 0/2).
  // Note: terminal:data subscription is persistent at the XTerm instance level
  // (see getOrCreateXTermInstance) so data keeps flowing even when this component unmounts.
  useEffect(() => {
    if (!terminalId || !instanceId) return;
    const tid = terminalId;
    const iid = instanceId;

    // Ensure the xterm instance exists (starts the persistent data subscription)
    getOrCreateXTermInstance(iid, { terminalId: tid });

    const unsubExit = transport.subscribe("terminal:exit", ({ terminalId: evtTid, exitCode }) => {
      if (evtTid === tid) {
        onExitRef.current?.(exitCode);
      }
    });

    const titleDisposable = getOrCreateXTermInstance(iid).term.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    return () => {
      unsubExit();
      titleDisposable.dispose();
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
      blockSuspend={blockSuspend}
      onData={handleData}
      onResize={handleResize}
      onCopy={() => toast("Copied to clipboard", "success")}
      className={className}
    />
  );
}

export { destroyXTermInstance };
