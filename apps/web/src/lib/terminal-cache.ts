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

  // Clipboard addon: handles OSC 52 clipboard sequences from CLI apps
  term.loadAddon(new ClipboardAddon());

  // Web links: clickable URLs in terminal output
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      if (event.ctrlKey || event.metaKey) {
        window.open(uri, "_blank", "noopener");
      }
    }),
  );

  // File links: detect file:// URLs and absolute paths like /home/...
  term.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      const line = term.buffer.active.getLine(lineNumber - 1);
      if (!line) return callback(undefined);
      const text = line.translateToString();
      const links: { startIndex: number; length: number; text: string }[] = [];

      // file:// URLs
      const fileUrlRegex = /file:\/\/[^\s"')\]>]+/g;
      let match;
      while ((match = fileUrlRegex.exec(text)) !== null) {
        links.push({ startIndex: match.index, length: match[0].length, text: match[0] });
      }

      // Absolute paths: /path/to/file.ext(:line(:col))
      const absPathRegex = /(?<!\w)(\/[\w.@\-/]+\.\w+(?::\d+(?::\d+)?)?)/g;
      while ((match = absPathRegex.exec(text)) !== null) {
        links.push({ startIndex: match.index, length: match[0].length, text: match[0] });
      }

      if (links.length === 0) return callback(undefined);
      callback(
        links.map((l) => {
          return {
            range: {
              start: { x: l.startIndex + 1, y: lineNumber },
              end: { x: l.startIndex + l.length + 1, y: lineNumber },
            },
            text: l.text,
            decorations: { underline: true, pointerCursor: true },
            activate: (e: MouseEvent) => {
              if (!e.ctrlKey && !e.metaKey) return;
              const parsed = l.text.replace(/^file:\/\//, "");
              const parts = parsed.split(":");
              const params: { filePath: string; line?: number; col?: number } = {
                filePath: parts[0]!,
              };
              if (parts[1]) params.line = Number(parts[1]);
              if (parts[2]) params.col = Number(parts[2]);
              transport.request("files.open", params).catch((err) => {
                console.error("[files.open] Failed:", err);
              });
            },
          };
        }),
      );
    },
  });

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
