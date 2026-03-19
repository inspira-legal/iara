import { useRef, useEffect, useCallback } from "react";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { transport } from "~/lib/ws-transport.js";
import { getOrCreateTerminal, destroyTerminal } from "~/lib/terminal-cache.js";
import { useTerminalStore } from "~/stores/terminal";
import { useToast } from "~/components/Toast";
import { RotateCw } from "lucide-react";

interface TerminalViewProps {
  taskId: string;
  resumeSessionId?: string;
}

export function TerminalView({ taskId, resumeSessionId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const entry = useTerminalStore((s) => s.getEntry(taskId));
  const createTerminal = useTerminalStore((s) => s.create);
  const restartTerminal = useTerminalStore((s) => s.restart);
  const { terminalId, status, exitCode } = entry;
  const terminalIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  terminalIdRef.current = terminalId;

  useEffect(() => {
    if (status === "idle") {
      void createTerminal(taskId, resumeSessionId);
    }
  }, [status, createTerminal, taskId, resumeSessionId]);

  // Attach/detach the cached xterm instance to the DOM
  useEffect(() => {
    if (!terminalId || !containerRef.current) return;

    const container = containerRef.current;
    const cached = getOrCreateTerminal(terminalId);
    const { term, fitAddon, keybindingHandlers } = cached;

    keybindingHandlers.onCopy = () => toast("Copied to clipboard", "success");

    // If the terminal hasn't been opened yet, open it
    if (!term.element) {
      term.open(container);
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        term.loadAddon(webglAddon);
      } catch {
        // Canvas fallback
      }
    } else {
      // Re-attach to DOM: move the element into the container
      container.appendChild(term.element);
    }

    fitAddon.fit();

    transport
      .request("terminal.resize", {
        terminalId,
        cols: term.cols,
        rows: term.rows,
      })
      .catch(() => {});

    const onData = term.onData((data) => {
      if (terminalIdRef.current) {
        transport
          .request("terminal.write", {
            terminalId: terminalIdRef.current,
            data,
          })
          .catch(() => {});
      }
    });

    let lastCols = term.cols;
    let lastRows = term.rows;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        fitAddon.fit();
        if (term.cols === lastCols && term.rows === lastRows) return;
        lastCols = term.cols;
        lastRows = term.rows;
        if (terminalIdRef.current) {
          transport
            .request("terminal.resize", {
              terminalId: terminalIdRef.current,
              cols: term.cols,
              rows: term.rows,
            })
            .catch(() => {});
        }
      }, 50);
    });
    resizeObserver.observe(container);

    term.focus();

    return () => {
      keybindingHandlers.onCopy = null;
      onData.dispose();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      // Don't dispose the terminal — just detach from DOM so it survives navigation
      if (term.element?.parentNode === container) {
        container.removeChild(term.element);
      }
    };
  }, [terminalId, toast]);

  // Cleanup on terminal exit
  useEffect(() => {
    if (status === "exited" && terminalId) {
      destroyTerminal(terminalId);
    }
  }, [status, terminalId]);

  const handleRestart = useCallback(() => {
    void restartTerminal(taskId);
  }, [restartTerminal, taskId]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div ref={containerRef} className="flex-1 overflow-hidden p-3" />
      {status === "exited" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80">
          <div className="flex flex-col items-center gap-3 text-zinc-400">
            <p className="text-sm">Claude exited{exitCode != null ? ` (code ${exitCode})` : ""}</p>
            <button
              type="button"
              onClick={handleRestart}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              <RotateCw size={14} />
              Restart
            </button>
          </div>
        </div>
      )}
      {status === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
          <p className="text-sm text-zinc-500">Starting Claude...</p>
        </div>
      )}
    </div>
  );
}
