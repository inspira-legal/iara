import type { IDisposable } from "@xterm/xterm";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebFontsAddon } from "@xterm/addon-web-fonts";
import { transport } from "./ws-transport.js";
import { setupTerminalKeybindings, type KeybindingHandlers } from "./terminal-keybindings.js";
import { findFileLinks, parseFilePath } from "./terminal-links.js";

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


// Track Ctrl/Meta state globally for link decoration toggling
let modHeld = false;
const activeDecorations = new Set<{ underline: boolean; pointerCursor: boolean }>();

function updateDecorations(): void {
  for (const d of activeDecorations) {
    d.underline = modHeld;
    d.pointerCursor = modHeld;
  }
}

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !modHeld) {
    modHeld = true;
    updateDecorations();
  }
});
window.addEventListener("keyup", (e) => {
  if (!e.ctrlKey && !e.metaKey && modHeld) {
    modHeld = false;
    updateDecorations();
  }
});
// Also clear when window loses focus
window.addEventListener("blur", () => {
  if (modHeld) {
    modHeld = false;
    updateDecorations();
  }
});


export function getOrCreateTerminal(terminalId: string): CachedTerminal {
  const existing = cache.get(terminalId);
  if (existing) return existing;

  const term = new Terminal({
    fontFamily: "'JetBrains Mono', monospace",
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
  const linkDisposable = term.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      const line = term.buffer.active.getLine(lineNumber - 1);
      if (!line) return callback(undefined);
      const text = line.translateToString();
      const links = findFileLinks(text);

      if (links.length === 0) return callback(undefined);
      callback(
        links.map((l) => {
          const decorations = { underline: modHeld, pointerCursor: modHeld };
          return {
            range: {
              start: { x: l.startIndex + 1, y: lineNumber },
              end: { x: l.startIndex + l.length + 1, y: lineNumber },
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
              transport.request("files.open", parseFilePath(l.text)).catch((err) => {
                console.error("[files.open] Failed:", err);
              });
            },
          };
        }),
      );
    },
  });

  // Web fonts: ensure JetBrains Mono loads before rendering
  const webFontsAddon = new WebFontsAddon();
  term.loadAddon(webFontsAddon);
  void webFontsAddon.loadFonts(["JetBrains Mono"]).then(() => fitAddon.fit());

  const unsub = transport.subscribe("terminal:data", ({ terminalId: tid, data }) => {
    if (tid === terminalId) {
      term.write(data);
    }
  });

  const write = (data: string) => {
    transport.request("terminal.write", { terminalId, data }).catch(() => {});
  };
  const keybindingHandlers = setupTerminalKeybindings(term, write);

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

export function getCachedTerminal(terminalId: string): CachedTerminal | undefined {
  return cache.get(terminalId);
}
