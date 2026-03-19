import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebFontsAddon } from "@xterm/addon-web-fonts";
import { transport } from "./ws-transport.js";
import { setupTerminalKeybindings, type KeybindingHandlers } from "./terminal-keybindings.js";

interface CachedTerminal {
  term: Terminal;
  fitAddon: FitAddon;
  unsub: () => void;
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

export function getOrCreateTerminal(terminalId: string): CachedTerminal {
  const existing = cache.get(terminalId);
  if (existing) return existing;

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
    rightClickSelectsWord: true,
    theme: THEME,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  // Clipboard addon: handles OSC 52 clipboard sequences from CLI apps
  term.loadAddon(new ClipboardAddon());

  // Web links: clickable URLs in terminal output
  term.loadAddon(new WebLinksAddon());

  // Web fonts: ensure JetBrains Mono loads properly before rendering
  const webFontsAddon = new WebFontsAddon();
  term.loadAddon(webFontsAddon);
  void webFontsAddon.loadFonts(["JetBrains Mono"]).then(() => {
    fitAddon.fit();
  });

  const unsub = transport.subscribe("terminal:data", ({ terminalId: tid, data }) => {
    if (tid === terminalId) {
      term.write(data);
    }
  });

  const write = (data: string) => {
    transport.request("terminal.write", { terminalId, data }).catch(() => {});
  };
  const keybindingHandlers = setupTerminalKeybindings(term, write);

  const cached: CachedTerminal = { term, fitAddon, unsub, terminalId, keybindingHandlers };
  cache.set(terminalId, cached);
  return cached;
}

export function destroyTerminal(terminalId: string): void {
  const cached = cache.get(terminalId);
  if (cached) {
    cached.unsub();
    cached.term.dispose();
    cache.delete(terminalId);
  }
}

export function getCachedTerminal(terminalId: string): CachedTerminal | undefined {
  return cache.get(terminalId);
}
