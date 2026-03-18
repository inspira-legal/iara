import { ipcMain } from "electron";
import type { DevCommand } from "../services/devservers.js";
import { Channels } from "./channels.js";

// Lazy import — supervisor is initialized in main.ts
let getSupervisor: () => import("../services/devservers.js").DevServerSupervisor;

export function initDevServerHandlers(
  supervisorGetter: () => import("../services/devservers.js").DevServerSupervisor,
): void {
  getSupervisor = supervisorGetter;
}

export function registerDevServerHandlers(): void {
  ipcMain.handle(Channels.DEV_START, (_event, cmd: DevCommand) => {
    getSupervisor().start(cmd);
  });

  ipcMain.handle(Channels.DEV_STOP, (_event, name: string) => {
    getSupervisor().stop(name);
  });

  ipcMain.handle(Channels.DEV_STATUS, () => {
    return getSupervisor().status();
  });

  ipcMain.handle(Channels.DEV_LOGS, (_event, name: string, limit?: number) => {
    return getSupervisor().getLogs(name, limit);
  });

  ipcMain.handle(Channels.DEV_DISCOVER, (_event, dir: string) => {
    const { discoverDevCommands } =
      require("../services/devservers.js") as typeof import("../services/devservers.js");
    return discoverDevCommands(dir);
  });
}
