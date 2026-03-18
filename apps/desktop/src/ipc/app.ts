import { app, ipcMain } from "electron";
import { Channels } from "./channels.js";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

function getAppVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return "0.0.1";
  }
}

export function registerAppHandlers(): void {
  ipcMain.handle(Channels.GET_APP_INFO, () => ({
    version: getAppVersion(),
    platform: process.platform,
    isDev: isDevelopment,
  }));
}
