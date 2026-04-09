import { useRef, useEffect, useCallback } from "react";
import type { IDisposable } from "@xterm/xterm";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon, type IClipboardProvider } from "@xterm/addon-clipboard";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebFontsAddon } from "@xterm/addon-web-fonts";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { setupTerminalKeybindings, type KeybindingHandlers } from "~/lib/terminal-keybindings";
import { findFileLinks, isRelativePath, parseFilePath } from "~/lib/terminal-links";
import { writeClipboard, readClipboard } from "~/lib/clipboard";
import { transport } from "~/lib/ws-transport";

const XTERM_THEME = {
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
};

export interface XTermInstance {
  term: Terminal;
  fitAddon: FitAddon;
  keybindingHandlers: KeybindingHandlers;
  linkDisposable: IDisposable;
  /** Write data to the terminal with scroll-preserving RAF batching. */
  writeData: (data: string) => void;
  /** Callback set by the consumer to send user input to the PTY. Keybindings use this. */
  onInput: ((data: string) => void) | null;
  dispose: () => void;
}

/**
 * Create a new xterm.js instance with all shared addons and behaviors:
 * - FitAddon, ClipboardAddon, WebLinksAddon, WebFontsAddon
 * - File link detection (Ctrl+Click)
 * - Scroll position preservation when user scrolled up
 * - RAF-batched data writes
 */
function createXTermInstance(opts?: {
  /** If set, file link Ctrl+Click resolves relative paths via terminal.getCwd */
  terminalId?: string;
  readOnly?: boolean;
  blockSuspend?: boolean;
}): XTermInstance {
  const term = new Terminal({
    fontFamily: "'JetBrainsMono NF', monospace",
    fontSize: 14,
    lineHeight: 1.0,
    letterSpacing: 0,
    cursorBlink: !opts?.readOnly,
    scrollback: 50000,
    customGlyphs: true,
    rescaleOverlappingGlyphs: true,
    drawBoldTextInBrightColors: false,
    rightClickSelectsWord: true,
    ...(opts?.readOnly ? { disableStdin: true } : {}),
    theme: XTERM_THEME,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const clipboardProvider: IClipboardProvider = {
    readText: () => readClipboard(),
    writeText: (_selection, text) => writeClipboard(text),
  };
  term.loadAddon(new ClipboardAddon(undefined, clipboardProvider));

  // Web links: Ctrl+Click to open URLs
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      if (event.ctrlKey || event.metaKey) {
        window.open(uri, "_blank", "noopener");
      }
    }),
  );

  // Ghostty-style: underline + pointer only when Ctrl/Cmd is held
  let modHeld = false;
  const activeDecorations = new Set<{ underline: boolean; pointerCursor: boolean }>();

  function setModHeld(held: boolean): void {
    if (held === modHeld) return;
    modHeld = held;
    for (const d of activeDecorations) {
      d.underline = held;
      d.pointerCursor = held;
    }
  }

  // File links: detect file paths (with bounded cache to avoid repeated regex work)
  const linkCache = new Map<string, ReturnType<typeof findFileLinks>>();
  const LINK_CACHE_MAX = 256;

  const linkDisposable = term.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      const buf = term.buffer.active;
      let startRow = lineNumber - 1;
      while (startRow > 0 && buf.getLine(startRow)?.isWrapped) {
        startRow--;
      }

      const rowWidths: number[] = [];
      let fullText = "";
      for (let r = startRow; ; r++) {
        const row = buf.getLine(r);
        if (!row) break;
        if (r > startRow && !row.isWrapped) break;
        const rowText = row.translateToString();
        rowWidths.push(rowText.length);
        fullText += rowText;
      }

      let links = linkCache.get(fullText);
      if (!links) {
        links = findFileLinks(fullText);
        if (linkCache.size >= LINK_CACHE_MAX) linkCache.clear();
        linkCache.set(fullText, links);
      }
      if (links.length === 0) return callback(undefined);

      function offsetToPos(offset: number): { x: number; y: number } {
        let remaining = offset;
        for (let i = 0; i < rowWidths.length; i++) {
          if (remaining < rowWidths[i]!) {
            return { x: remaining + 1, y: startRow + 1 + i };
          }
          remaining -= rowWidths[i]!;
        }
        return { x: 1, y: startRow + rowWidths.length };
      }

      callback(
        links.map((l) => {
          const decorations = { underline: modHeld, pointerCursor: modHeld };
          return {
            range: {
              start: offsetToPos(l.startIndex),
              end: offsetToPos(l.startIndex + l.length),
            },
            text: l.text,
            decorations,
            hover: () => {
              activeDecorations.add(decorations);
              decorations.underline = modHeld;
              decorations.pointerCursor = modHeld;
            },
            leave: () => {
              activeDecorations.delete(decorations);
              decorations.underline = false;
              decorations.pointerCursor = false;
            },
            activate: (e: MouseEvent) => {
              if (!e.ctrlKey && !e.metaKey) return;
              const open = (cwd?: string | null) => {
                transport.request("files.open", parseFilePath(l.text, cwd)).catch((err) => {
                  console.error("[files.open] Failed:", err);
                });
              };
              if (isRelativePath(l.text) && opts?.terminalId) {
                transport
                  .request("terminal.getCwd", { terminalId: opts.terminalId })
                  .then(open)
                  .catch(() => open());
              } else {
                open();
              }
            },
          };
        }),
      );
    },
  });

  // Web fonts: ensure JetBrains Mono loads before rendering
  const webFontsAddon = new WebFontsAddon();
  term.loadAddon(webFontsAddon);
  void webFontsAddon.loadFonts(["JetBrainsMono NF"]).then(() => fitAddon.fit());

  // Scroll position preservation
  let userScrolledUp = false;
  let restoringScroll = false;

  term.onScroll(() => {
    if (restoringScroll) return;
    const buf = term.buffer.active;
    userScrolledUp = buf.viewportY < buf.baseY;
  });

  // RAF-batched data writes
  let pendingData = "";
  let rafId: ReturnType<typeof requestAnimationFrame> | null = null;

  function flushWrite(): void {
    rafId = null;
    const chunk = pendingData;
    pendingData = "";

    if (userScrolledUp) {
      const buf = term.buffer.active;
      const savedViewportY = buf.viewportY;
      const savedBaseY = buf.baseY;
      term.write(chunk, () => {
        const delta = buf.baseY - savedBaseY;
        if (delta > 0 && buf.viewportY !== savedViewportY) {
          restoringScroll = true;
          term.scrollToLine(savedViewportY + delta);
          requestAnimationFrame(() => {
            restoringScroll = false;
          });
        }
      });
    } else {
      term.write(chunk);
    }
  }

  function writeData(data: string): void {
    pendingData += data;
    if (rafId === null) {
      rafId = requestAnimationFrame(flushWrite);
    }
  }

  // Keybindings: send user input to PTY via onInput callback (set by consumer).
  // The PTY echoes back the data which xterm displays — no local write needed.
  const instance: XTermInstance = {
    term,
    fitAddon,
    keybindingHandlers: null!,
    linkDisposable,
    writeData,
    onInput: null,
    dispose: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        pendingData = "";
      }
      linkDisposable.dispose();
      term.dispose();
    },
  };

  const write = opts?.readOnly
    ? () => {}
    : (data: string) => {
        instance.onInput?.(data);
      };
  const keybindingHandlers = setupTerminalKeybindings(
    term,
    write,
    opts?.blockSuspend ? { blockSuspend: true } : undefined,
  );
  keybindingHandlers.onModChange = setModHeld;
  instance.keybindingHandlers = keybindingHandlers;

  return instance;
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

interface XTermProps {
  /** Stable key for this terminal instance (used to cache/reuse across re-renders). */
  instanceId: string;
  onData?: ((data: string) => void) | undefined;
  onCopy?: (() => void) | undefined;
  onResize?: ((cols: number, rows: number) => void) | undefined;
  readOnly?: boolean | undefined;
  /** Terminal ID for resolving relative file paths via getCwd. */
  terminalId?: string | undefined;
  /** Block Ctrl+Z (SIGTSTP) from reaching the terminal. */
  blockSuspend?: boolean | undefined;
  className?: string | undefined;
}

/** Instance registry — survives React re-renders and navigation. */
const instances = new Map<string, XTermInstance>();
/** Persistent data subscriptions — keyed by instance ID, lives as long as the instance. */
const dataSubscriptions = new Map<string, () => void>();

export function destroyXTermInstance(id: string): void {
  const unsub = dataSubscriptions.get(id);
  if (unsub) {
    unsub();
    dataSubscriptions.delete(id);
  }
  const instance = instances.get(id);
  if (instance) {
    instance.dispose();
    instances.delete(id);
  }
}

export function getOrCreateXTermInstance(
  id: string,
  opts?: { readOnly?: boolean; terminalId?: string; blockSuspend?: boolean },
): XTermInstance {
  const existing = instances.get(id);
  if (existing) return existing;
  const instance = createXTermInstance(opts);
  instances.set(id, instance);

  // Start a persistent data subscription so the xterm buffer stays up-to-date
  // even when the React component (ConnectedTerminal) is unmounted.
  if (opts?.terminalId && !dataSubscriptions.has(id)) {
    const tid = opts.terminalId;
    const unsub = transport.subscribe("terminal:data", ({ terminalId: evtTid, data }) => {
      if (evtTid === tid) {
        instance.writeData(data);
      }
    });
    dataSubscriptions.set(id, unsub);
  }

  return instance;
}

export function XTerm({
  instanceId,
  onData,
  onCopy,
  onResize,
  readOnly,
  terminalId,
  blockSuspend,
  className,
}: XTermProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onDataRef = useRef(onData);
  const onCopyRef = useRef(onCopy);
  const onResizeRef = useRef(onResize);
  onDataRef.current = onData;
  onCopyRef.current = onCopy;
  onResizeRef.current = onResize;

  const attach = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const opts: { readOnly?: boolean; terminalId?: string; blockSuspend?: boolean } = {};
    if (readOnly) opts.readOnly = readOnly;
    if (terminalId) opts.terminalId = terminalId;
    if (blockSuspend) opts.blockSuspend = blockSuspend;
    const instance = getOrCreateXTermInstance(instanceId, opts);
    const { term, fitAddon, keybindingHandlers } = instance;

    keybindingHandlers.onCopy = () => onCopyRef.current?.();
    // Wire keybinding input (e.g. Shift+Enter) to the PTY via onData callback
    instance.onInput = readOnly ? null : (data) => onDataRef.current?.(data);

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
      container.appendChild(term.element);
    }

    // Defer initial fit to next frame so the flex container has its final dimensions.
    // Always fire onResize after the initial fit so the PTY gets the correct size.
    requestAnimationFrame(() => {
      fitAddon.fit();
      onResizeRef.current?.(term.cols, term.rows);
    });

    // User input
    let onDataDisposable: IDisposable | null = null;
    if (!readOnly) {
      onDataDisposable = term.onData((data) => {
        onDataRef.current?.(data);
      });
    }

    // Resize
    let lastCols = term.cols;
    let lastRows = term.rows;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        fitAddon.fit();
        if (term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols;
          lastRows = term.rows;
          onResizeRef.current?.(term.cols, term.rows);
        }
      }, 50);
    });
    resizeObserver.observe(container);

    if (!readOnly) {
      // Defer focus to ensure DOM is fully settled after React renders
      requestAnimationFrame(() => term.focus());
    }

    return () => {
      keybindingHandlers.onCopy = null;
      instance.onInput = null;
      onDataDisposable?.dispose();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      if (term.element?.parentNode === container) {
        container.removeChild(term.element);
      }
    };
  }, [instanceId, readOnly, terminalId, blockSuspend]);

  useEffect(() => attach(), [attach]);

  // Click-to-focus fallback for when focus is lost
  const handleClick = useCallback(() => {
    const instance = instances.get(instanceId);
    if (instance && !readOnly) {
      instance.term.focus();
    }
  }, [instanceId, readOnly]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-hidden ${className ?? ""}`}
      onClick={handleClick}
    />
  );
}
