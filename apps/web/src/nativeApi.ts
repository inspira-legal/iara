import type { DesktopBridge } from "@iara/contracts";

function getDesktopBridge(): DesktopBridge | null {
  if (typeof window !== "undefined" && "desktopBridge" in window) {
    return window.desktopBridge as DesktopBridge;
  }
  return null;
}

export const desktopBridge = getDesktopBridge();
