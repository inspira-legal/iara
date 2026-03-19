import type { Terminal } from "@xterm/xterm";

export interface KeybindingHandlers {
  onCopy: (() => void) | null;
  onModChange: ((held: boolean) => void) | null;
}

/** Returns true if the event matches a keybinding we handle. */
function matchesKeybinding(event: KeyboardEvent): boolean {
  const isCtrl = event.ctrlKey || event.metaKey;
  if (!isCtrl) return false;

  if (event.shiftKey) {
    return event.code === "KeyC" || event.code === "KeyV" || event.code === "KeyA";
  }
  return event.key === "Enter" || event.key === "Backspace";
}

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

    // Block both keydown and keyup for our keybindings (xterm.js issue #2293)
    if (!matchesKeybinding(event)) return true;
    if (event.type !== "keydown") return false;

    const isCtrl = event.ctrlKey || event.metaKey;

    // Ctrl+Shift+C = Copy selection
    if (isCtrl && event.shiftKey && event.code === "KeyC") {
      const selection = term.getSelection();
      if (selection) {
        void navigator.clipboard.writeText(selection);
        handlers.onCopy?.();
      }
      return false;
    }

    // Ctrl+Shift+V = Paste
    if (isCtrl && event.shiftKey && event.code === "KeyV") {
      void navigator.clipboard.readText().then((text) => {
        if (text) term.paste(text);
      });
      return false;
    }

    // Ctrl+Shift+A = Select all
    if (isCtrl && event.shiftKey && event.code === "KeyA") {
      term.selectAll();
      return false;
    }

    // Ctrl+Backspace = Delete word backward
    if (isCtrl && !event.shiftKey && event.key === "Backspace") {
      write("\x1b\x7f");
      return false;
    }

    // Ctrl+Enter = Newline literal
    if (isCtrl && !event.shiftKey && event.key === "Enter") {
      write("\n");
      return false;
    }

    return true;
  });

  return handlers;
}
