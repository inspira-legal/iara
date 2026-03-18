export const isElectron = typeof window !== "undefined" && "desktopBridge" in window;
