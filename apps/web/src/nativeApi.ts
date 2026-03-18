import type { DesktopBridge } from "@iara/contracts";

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

function getDesktopBridge(): DesktopBridge | null {
  if (typeof window !== "undefined" && window.desktopBridge) {
    return window.desktopBridge;
  }
  return null;
}

export function ensureNativeApi(): DesktopBridge {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("desktopBridge not available — not running in Electron");
  return bridge;
}

export const desktopBridge = getDesktopBridge();
