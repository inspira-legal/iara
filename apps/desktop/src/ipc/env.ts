import { ipcMain } from "electron";
import { readEnvFile, writeEnvFile, mergeEnvFiles } from "../services/env.js";
import { Channels } from "./channels.js";

export function registerEnvHandlers(): void {
  ipcMain.handle(Channels.ENV_READ, (_event, filePath: string) => {
    return readEnvFile(filePath);
  });

  ipcMain.handle(
    Channels.ENV_WRITE,
    (_event, filePath: string, entries: Array<{ key: string; value: string }>) => {
      writeEnvFile(filePath, entries);
    },
  );

  ipcMain.handle(Channels.ENV_MERGE, (_event, filePaths: string[]) => {
    return mergeEnvFiles(filePaths);
  });
}
