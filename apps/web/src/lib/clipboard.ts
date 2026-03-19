import { desktopBridge } from "~/nativeApi";

/**
 * Write text to the system clipboard.
 * Prefers Electron IPC (works on custom protocol schemes where
 * navigator.clipboard is unavailable), falls back to web API.
 */
export function writeClipboard(text: string): void {
  if (desktopBridge?.clipboardWrite) {
    void desktopBridge.clipboardWrite(text);
  } else {
    void navigator.clipboard.writeText(text);
  }
}

/**
 * Read text from the system clipboard.
 * Same fallback strategy as writeClipboard.
 */
export function readClipboard(): Promise<string> {
  if (desktopBridge?.clipboardRead) {
    return desktopBridge.clipboardRead();
  }
  return navigator.clipboard.readText();
}
