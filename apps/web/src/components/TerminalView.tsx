import { useRef, useEffect, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { ensureNativeApi } from "~/nativeApi";
import { useTerminal } from "~/hooks/useTerminal";
import { RotateCw } from "lucide-react";

interface TerminalViewProps {
  taskId: string;
}

export function TerminalView({ taskId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { terminalId, status, exitCode, create, restart } = useTerminal(taskId);
  const terminalIdRef = useRef<string | null>(null);

  terminalIdRef.current = terminalId;

  useEffect(() => {
    if (status === "idle") {
      void create();
    }
  }, [status, create]);

  useEffect(() => {
    if (!terminalId || !containerRef.current) return;

    const container = containerRef.current;
    const api = ensureNativeApi();
    const tid = terminalId;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
      fontSize: 14,
      lineHeight: 1.0,
      letterSpacing: 0,
      cursorBlink: true,
      scrollback: 50000,
      customGlyphs: true,
      rescaleOverlappingGlyphs: true,
      drawBoldTextInBrightColors: false,
      theme: {
        background: "#09090b",
        foreground: "#f4f4f5",
        cursor: "#f4f4f5",
        selectionBackground: "#3f3f46",
        black: "#09090b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#f4f4f5",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // Canvas fallback
    }

    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    api.terminalResize(tid, term.cols, term.rows).catch(() => {});

    term.onData((data) => {
      if (terminalIdRef.current) {
        api.terminalWrite(terminalIdRef.current, data).catch(() => {});
      }
    });

    api.onTerminalData((evtTid: string, data: string) => {
      if (evtTid === tid) {
        term.write(data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (terminalIdRef.current) {
        api.terminalResize(terminalIdRef.current, term.cols, term.rows).catch(() => {});
      }
    });
    resizeObserver.observe(container);

    term.focus();

    return () => {
      api.offTerminalData();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId]);

  const handleRestart = useCallback(() => {
    void restart();
  }, [restart]);

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
