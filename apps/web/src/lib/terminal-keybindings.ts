import type { Terminal } from "@xterm/xterm";
import { writeClipboard } from "./clipboard.js";

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
        writeClipboard(selection);
        handlers.onCopy?.();
      }
    },
  },
  {
    ctrl: true,
    shift: true,
    key: "v",
    // No-op: prevent xterm from processing as a key sequence, but let the
    // browser's native paste event fire so xterm's built-in paste handler works.
    action: () => {},
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
// App-level shortcuts that must pass through xterm to the window listener
// ---------------------------------------------------------------------------

function isAppShortcut(event: KeyboardEvent): boolean {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  // mod+w, mod+k, mod+n, mod+b
  if (mod && !event.shiftKey && !event.altKey && "wknb".includes(key)) return true;
  // mod+1-9
  if (mod && !event.shiftKey && !event.altKey && key >= "1" && key <= "9") return true;
  // alt+1-9
  if (event.altKey && !mod && !event.shiftKey && key >= "1" && key <= "9") return true;
  // F1
  if (key === "f1") return true;

  return false;
}

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
  opts?: { blockSuspend?: boolean },
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

    // Let app-level shortcuts pass through to the window listener
    if (isAppShortcut(event)) return false;

    // Block Ctrl+Z (SIGTSTP) in Claude sessions — suspending is not useful
    if (
      opts?.blockSuspend &&
      event.type === "keydown" &&
      event.key === "z" &&
      event.ctrlKey &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      return false;
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
