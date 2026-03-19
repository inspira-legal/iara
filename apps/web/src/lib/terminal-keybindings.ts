import type { Terminal } from "@xterm/xterm";

export interface KeybindingHandlers {
  onCopy: (() => void) | null;
  onModChange: ((held: boolean) => void) | null;
}

// ---------------------------------------------------------------------------
// Keybinding definitions
// ---------------------------------------------------------------------------

type Action = (term: Terminal, write: (data: string) => void, handlers: KeybindingHandlers) => void;

interface Keybinding {
  ctrl: boolean;
  shift: boolean;
  key: string; // lowercase key value
  action: Action;
}

const KEYBINDINGS: Keybinding[] = [
  {
    ctrl: true,
    shift: true,
    key: "c",
    action: (term, _write, handlers) => {
      const selection = term.getSelection();
      if (selection) {
        void navigator.clipboard.writeText(selection);
        handlers.onCopy?.();
      }
    },
  },
  {
    ctrl: true,
    shift: true,
    key: "v",
    action: (term) => {
      void navigator.clipboard.readText().then((text) => {
        if (text) term.paste(text);
      });
    },
  },
  {
    ctrl: true,
    shift: true,
    key: "a",
    action: (term) => term.selectAll(),
  },
  {
    ctrl: true,
    shift: false,
    key: "backspace",
    action: (_term, write) => write("\x1b\x7f"),
  },
  {
    ctrl: false,
    shift: true,
    key: "enter",
    action: (_term, write) => write("\n"),
  },
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function findBinding(event: KeyboardEvent): Keybinding | undefined {
  const isCtrl = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  return KEYBINDINGS.find((b) => b.ctrl === isCtrl && b.shift === event.shiftKey && b.key === key);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupTerminalKeybindings(
  term: Terminal,
  write: (data: string) => void,
): KeybindingHandlers {
  const handlers: KeybindingHandlers = { onCopy: null, onModChange: null };
  let prevMod = false;

  term.attachCustomKeyEventHandler((event) => {
    // Track Ctrl/Meta for link decorations (xterm captures keys, window doesn't see them)
    const mod = event.ctrlKey || event.metaKey;
    if (mod !== prevMod) {
      prevMod = mod;
      handlers.onModChange?.(mod);
    }

    const binding = findBinding(event);
    if (!binding) return true; // let xterm handle it

    // Block both keydown and keyup for our keybindings (xterm.js issue #2293)
    if (event.type !== "keydown") return false;

    binding.action(term, write, handlers);
    return false;
  });

  return handlers;
}
