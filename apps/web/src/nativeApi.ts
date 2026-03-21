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

export const desktopBridge = getDesktopBridge();
