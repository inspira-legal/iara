import type { IDisposable } from "@xterm/xterm";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebFontsAddon } from "@xterm/addon-web-fonts";
import { transport } from "./ws-transport.js";
import {
  setupTerminalKeybindings,
  type KeybindingHandlers,
} from "./terminal-keybindings.js";
import {
  findFileLinks,
  isRelativePath,
  parseFilePath,
} from "./terminal-links.js";

interface CachedTerminal {
  term: Terminal;
  fitAddon: FitAddon;
  unsub: () => void;
  linkDisposable: IDisposable;
  terminalId: string;
  keybindingHandlers: KeybindingHandlers;
}

const cache = new Map<string, CachedTerminal>();

const THEME = {
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

// Ghostty-style: underline + pointer only when Ctrl/Cmd is held
let modHeld = false;
const activeDecorations = new Set<{
  underline: boolean;
  pointerCursor: boolean;
}>();

function setModHeld(held: boolean): void {
  if (held === modHeld) return;
  modHeld = held;
  for (const d of activeDecorations) {
    d.underline = held;
    d.pointerCursor = held;
  }
}

export function getOrCreateTerminal(terminalId: string): CachedTerminal {
  const existing = cache.get(terminalId);
  if (existing) return existing;

  const term = new Terminal({
    fontFamily: "'JetBrains Mono NF', monospace",
    fontSize: 14,
    lineHeight: 1.0,
    letterSpacing: 0,
    cursorBlink: true,
    scrollback: 50000,
    customGlyphs: true,
    rescaleOverlappingGlyphs: true,
    drawBoldTextInBrightColors: false,
    rightClickSelectsWord: true,
    theme: THEME,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new ClipboardAddon());

  // Web links: Ctrl+Click to open URLs
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      if (event.ctrlKey || event.metaKey) {
        window.open(uri, "_blank", "noopener");
      }
    }),
  );

  // File links: detect file:// URLs and absolute paths
  // Kitty-style: underline + pointer always on hover, Ctrl+Click to open
  const linkDisposable = term.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      const buf = term.buffer.active;

      // Walk backwards to find the start of the logical line (unwrap)
      let startRow = lineNumber - 1;
      while (startRow > 0 && buf.getLine(startRow)?.isWrapped) {
        startRow--;
      }

      // Concatenate all wrapped rows into one logical line, tracking row boundaries
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

      const links = findFileLinks(fullText);
      if (links.length === 0) return callback(undefined);

      // Convert flat offset to (row, col) in the buffer
      function offsetToPos(offset: number): { x: number; y: number } {
        let remaining = offset;
        for (let i = 0; i < rowWidths.length; i++) {
          if (remaining < rowWidths[i]!) {
            return { x: remaining + 1, y: startRow + 1 + i };
          }
          remaining -= rowWidths[i]!;
        }
        const lastRow = startRow + rowWidths.length;
        return { x: 1, y: lastRow };
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
                transport
                  .request("files.open", parseFilePath(l.text, cwd))
                  .catch((err) => {
                    console.error("[files.open] Failed:", err);
                  });
              };
              if (isRelativePath(l.text)) {
                transport
                  .request("terminal.getCwd", { terminalId })
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
  void webFontsAddon
    .loadFonts(["JetBrains Mono NF"])
    .then(() => fitAddon.fit());

  const unsub = transport.subscribe(
    "terminal:data",
    ({ terminalId: tid, data }) => {
      if (tid === terminalId) {
        term.write(data);
      }
    },
  );

  const write = (data: string) => {
    transport.request("terminal.write", { terminalId, data }).catch(() => {});
  };
  const keybindingHandlers = setupTerminalKeybindings(term, write);
  keybindingHandlers.onModChange = setModHeld;

  const cached: CachedTerminal = {
    term,
    fitAddon,
    unsub,
    linkDisposable,
    terminalId,
    keybindingHandlers,
  };
  cache.set(terminalId, cached);
  return cached;
}

export function destroyTerminal(terminalId: string): void {
  const cached = cache.get(terminalId);
  if (cached) {
    cached.unsub();
    cached.linkDisposable.dispose();
    cached.term.dispose();
    cache.delete(terminalId);
  }
}

export function getCachedTerminal(
  terminalId: string,
): CachedTerminal | undefined {
  return cache.get(terminalId);
}
